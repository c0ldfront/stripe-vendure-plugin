import { LanguageCode } from '@vendure/common/lib/generated-types';
import {
    CreatePaymentErrorResult,
    CreatePaymentResult,
    CreateRefundResult,
    Customer,
    Logger,
    Order,
    Payment,
    PaymentMethodHandler,
    SettlePaymentResult,
} from '@vendure/core';
import { Connection } from 'typeorm';
import { createStripeCustomer, getGateway } from './stripe-common';
import { loggerCtx } from './constants';
import { Stripe } from 'stripe';
import { ConfigArgValues } from '@vendure/core/dist/common/configurable-operation';

let connection: Connection | null = null;

/**
 * The handler for stripe payments.
 * export declare type ConfigArgType = 'string' | 'int' | 'float' | 'boolean' | 'datetime' | 'ID';
 */
export const stripePaymentMethodHandler = new PaymentMethodHandler({
    code: 'stripe',
    description: [{ languageCode: LanguageCode.en, value: 'Stripe Payment Gateway' }],
    args: {
        stripeTestMode: {
            type: 'boolean',
            label: [{ languageCode: LanguageCode.en, value: 'Enable Stripe Test Mode' }],
        },
        stripeAutomaticCapture: {
            type: 'boolean',
            label: [{ languageCode: LanguageCode.en, value: 'Enable Automatic Capture' }],
        },
        enableStripeReceipts: {
            type: 'boolean',
            label: [{ languageCode: LanguageCode.en, value: 'Enable Stripe Receipts' }],
        },
        testPublishableKey: {
            type: 'string',
            label: [{ languageCode: LanguageCode.en, value: 'Test Publishable Key' }],
        },
        testSecretKey: {
            type: 'string',
            label: [{ languageCode: LanguageCode.en, value: 'Test Secret Key' }],
        },
        livePublishableKey: {
            type: 'string',
            label: [{ languageCode: LanguageCode.en, value: 'Live Publishable Key' }],
        },
        liveSecretKey: {
            type: 'string',
            label: [{ languageCode: LanguageCode.en, value: 'Live Secret Key' }],
        },
        statementDescriptor: {
            type: 'string',
            label: [{ languageCode: LanguageCode.en, value: 'Statement Descriptor' }],
        },
        enableStripeWebhooks: {
            type: 'boolean',
            label: [{ languageCode: LanguageCode.en, value: 'Enable Stripe Webhooks' }],
        },
        testWebhookSecretKey: {
            type: 'string',
            label: [{ languageCode: LanguageCode.en, value: 'Test Webhook Secret Key' }],
        },
        liveWebhookSecretKey: {
            type: 'string',
            label: [{ languageCode: LanguageCode.en, value: 'Live Webhook Secret Key' }],
        },
        enableStripeCustomers: {
            type: 'boolean',
        },
    },
    init(injector) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        connection = injector.getConnection();
    },
    destroy() {
        connection = null;
    },
    createPayment: async (order, args, metadata): Promise<CreatePaymentResult | CreatePaymentErrorResult> => {
        const gateway = getGateway(args);
        let intent: Stripe.Response<Stripe.PaymentIntent>;
        let stripCustomer: Stripe.Customer | null = null;

        try {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const { stripeCustomerId } = order.customer.customFields;
            if (order.customer && !stripeCustomerId && args.enableStripeCustomers && connection) {
                stripCustomer = await createStripeCustomer(gateway, order.customer);
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                order.customer.customFields.stripeCustomerId = stripCustomer.id;
                await connection.getRepository(Customer).save(order.customer);
            }

            intent = await gateway.paymentIntents.create({
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                customer: !stripCustomer ? order.customer.customFields.stripeCustomerId : stripCustomer.id,
                amount: order.total,
                currency: order.currencyCode,
                payment_method: metadata.paymentMethod.id,
                capture_method: args.stripeAutomaticCapture ? 'automatic' : 'manual',
                confirmation_method: args.stripeAutomaticCapture ? 'automatic' : 'manual',
                confirm: true,
            });
        } catch (e) {
            Logger.error(e, loggerCtx);
            return {
                amount: order.total,
                state: 'Error',
                errorMessage: e,
            };
        }

        return {
            amount: order.total,
            state: args.stripeAutomaticCapture ? 'Settled' : 'Authorized',
            transactionId: '',
            metadata: intent,
        };
    },

    settlePayment: async (
        order: Order,
        payment: Payment,
        args: ConfigArgValues<any>,
    ): Promise<SettlePaymentResult> => {
        const gateway = getGateway(args);
        let response;
        try {
            response = await gateway.paymentIntents.capture(payment.metadata.id, {
                amount_to_capture: order.total,
            });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.log(e);
            return {
                success: false,
                metadata: response,
            };
        }

        return {
            success: true,
            metadata: response,
        };
    },

    createRefund: async (
        input: any,
        total: number,
        order: Order,
        payment: Payment,
        args: ConfigArgValues<any>,
    ): Promise<CreateRefundResult> => {
        const gateway = getGateway(args);
        let response;

        try {
            response = await gateway.refunds.create({
                payment_intent: payment.metadata.id,
                amount: total,
                reason: 'requested_by_customer',
            });
        } catch (e) {
            // TODO: might be a better way to handle errors from bad responses.
            // https://stripe.com/docs/error-codes#charge-already-refunded
            if (e.type === 'StripeInvalidRequestError') {
                switch (e.code) {
                    case 'charge_already_refunded':
                        return {
                            state: 'Failed' as const,
                            transactionId: payment.transactionId,
                            metadata: {
                                response: e.raw,
                            },
                        };
                }
            }
        }

        if (response?.status === 'failed') {
            return {
                state: 'Failed' as const,
                transactionId: response.id,
                metadata: response,
            };
        }

        return {
            state: 'Settled' as const,
            transactionId: response?.id,
            metadata: response,
        };
    },
});

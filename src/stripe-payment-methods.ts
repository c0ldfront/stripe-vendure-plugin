import { LanguageCode } from '@vendure/common/lib/generated-types';
import {
    CreatePaymentResult,
    CreateRefundResult,
    Logger,
    Order,
    Payment,
    PaymentMethodHandler,
    SettlePaymentResult,
} from '@vendure/core';

import { getGateway } from './stripe-common';
import { loggerCtx } from './constants';
import { Stripe } from 'stripe';
import { ConfigArgValues } from '@vendure/core/dist/common/configurable-operation';
import { PaymentMetadata } from '@vendure/core/dist/entity/payment/payment.entity';

/**
 * The handler for stripe payments.
 * export declare type ConfigArgType = 'string' | 'int' | 'float' | 'boolean' | 'datetime' | 'ID';
 */
export const stripePaymentMethodHandler = new PaymentMethodHandler({
    code: 'stripe',
    description: [{ languageCode: LanguageCode.en, value: 'stripe_description' }],
    args: {
        stripeTestMode: {
            type: 'boolean',
        },
        stripeAutomaticCapture: {
            type: 'boolean',
        },
        testPublishableKey: {
            type: 'string',
        },
        testSecretKey: {
            type: 'string',
        },
        livePublishableKey: {
            type: 'string',
        },
        liveSecretKey: {
            type: 'string',
        },
        statementDescriptor: {
            type: 'string',
        },
        enableStripeWebhooks: {
            type: 'boolean',
        },
        testWebhookSecretKey: {
            type: 'string',
        },
        liveWebhookSecretKey: {
            type: 'string',
        },
        enableStripeReceipts: {
            type: 'boolean',
        },
        enableStripeWebhookSignatureCheck: {
            type: 'boolean',
        },
    },

    createPayment: async ({
        order,
        args,
        metadata,
    }: {
        order: Order;
        args: ConfigArgValues<any>;
        metadata: PaymentMetadata;
    }): Promise<CreatePaymentResult> => {
        const gateway = getGateway(args);
        let intent!: Stripe.Response<Stripe.PaymentIntent>;

        try {
            intent = await gateway.paymentIntents.create({
                amount: order.total,
                currency: order.currencyCode,
                payment_method: metadata.paymentMethod.id,
                capture_method: args.stripeAutomaticCapture ? 'automatic' : 'manual',
                confirmation_method: args.stripeAutomaticCapture ? 'automatic' : 'manual',
                confirm: true,
            });
        } catch (e) {
            Logger.error(e, loggerCtx);
        }

        return {
            amount: order.total,
            state: args.stripeAutomaticCapture ? 'Settled' : 'Authorized',
            transactionId: intent!.id.toString(),
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

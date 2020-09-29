import { Controller, Post, Req, Res } from '@nestjs/common';
import {
    ChannelService,
    EntityNotFoundError,
    ID,
    LanguageCode,
    Logger,
    OrderService,
    Payment,
    RequestContext,
} from '@vendure/core';
import { loggerCtx } from './constants';
import { getGateway, getPaymentMethodArgs } from './stripe-common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';
import { IStripeOrder } from './interfaces';
import { Stripe } from 'stripe';

@Controller('stripe')
export class StripeController {
    constructor(
        @InjectConnection() private connection: Connection,
        private orderService: OrderService,
        private channelService: ChannelService,
    ) {}

    @Post('/webhook/')
    async index(@Req() req: any, @Res() res: any): Promise<any> {
        const args = await getPaymentMethodArgs(this.connection);
        const stripe = getGateway(args);
        const ctx = await this.createContext();

        const sig = req.headers['stripe-signature'] as string;
        const endpointSecret = !args.stripeTestMode ? args.liveWebhookSecretKey : args.testWebhookSecretKey;
        let event: Stripe.Event;

        try {
            event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
        } catch (err) {
            Logger.error(`Webhook error: ${err.message}`, loggerCtx);
            return res.status(400);
        }

        Logger.info(`Webhook success: ${event.id}`, loggerCtx);

        // we shouldn't have to check if the object is undefined or null seeing we do that within the function itself.
        const paymentRecord = await this.getPaymentByTransactionId(event.id);

        const stripeOrderEvent: IStripeOrder = {
            ctx: ctx,
            event: event,
            payment: paymentRecord,
        };

        switch (event.type) {
            case 'source.chargeable':
                await this.handleWebhookPayment(stripeOrderEvent);
                break;
            case 'source.canceled':
                await this.handleWebhookSourceCanceled(stripeOrderEvent);
                break;
            case 'charge.succeeded':
                await this.handleWebhookChargeSucceeded(stripeOrderEvent);
                break;
            case 'charge.failed':
                await this.handleWebhookChargeFailed(stripeOrderEvent);
                break;
            case 'charge.captured':
                await this.handleWebhookCapture(stripeOrderEvent);
                break;
            case 'charge.dispute.created':
                await this.handleWebhookDispute(stripeOrderEvent);
                break;
            case 'charge.refunded':
                await this.handleWebhookRefund(stripeOrderEvent);
                break;
            case 'review.opened':
                await this.handleWebhookReviewOpened(stripeOrderEvent);
                break;
            case 'review.closed':
                await this.handleWebhookReviewClosed(stripeOrderEvent);
                break;
            case 'payment_intent.succeeded':
            case 'payment_intent.payment_failed':
            case 'payment_intent.amount_capturable_updated':
                await this.handleWebhookPaymentIntentSuccess(stripeOrderEvent);
                break;
            case 'setup_intent.succeeded':
            case 'setup_intent.setup_failed':
                await this.handleWebhookSetupIntent(stripeOrderEvent);
                break;
            default:
                Logger.warn(`Unhandled event type ${event.type}`, loggerCtx);
                return res.status(400);
        }

        return res.send(200);
    }

    // constructStripeObject<T>(stripeDataObject: Stripe.Event.Data): T {
    //     return stripeDataObject.object as T;
    // }

    async handleWebhookPayment(stripeOrderEvent: IStripeOrder): Promise<void> {
        // const stripeObject = this.constructStripeObject<Stripe.Source>(stripeOrderEvent.event.data);
        const stripeObject = stripeOrderEvent.event.data.object as Stripe.Source;
        Logger.info(`source.chargeable: ${stripeOrderEvent.event.id}`, loggerCtx);
        // await this.orderService.settlePayment(stripeOrderEvent.ctx, 20);
    }

    async handleWebhookSourceCanceled(stripeOrderEvent: IStripeOrder): Promise<void> {
        const stripeObject = stripeOrderEvent.event.data.object as Stripe.Source;
        Logger.info(`source.canceled: ${stripeOrderEvent.event.id}`, loggerCtx);
    }

    async handleWebhookChargeSucceeded(stripeOrderEvent: IStripeOrder): Promise<void> {
        const stripeObject = stripeOrderEvent.event.data.object as Stripe.Charge;
        Logger.info(`charge.succeeded: ${stripeOrderEvent.event.id}`, loggerCtx);
    }

    async handleWebhookChargeFailed(stripeOrderEvent: IStripeOrder): Promise<void> {
        const stripeObject = stripeOrderEvent.event.data.object as Stripe.Charge;
        Logger.info(`charge.failed: ${stripeOrderEvent.event.id}`, loggerCtx);
    }

    async handleWebhookCapture(stripeOrderEvent: IStripeOrder): Promise<void> {
        const stripeObject = stripeOrderEvent.event.data.object as Stripe.Charge;
        Logger.info(`charge.captured: ${stripeOrderEvent.event.id}`, loggerCtx);
    }

    async handleWebhookDispute(stripeOrderEvent: IStripeOrder): Promise<void> {
        const stripeObject = stripeOrderEvent.event.data.object as Stripe.Charge;
        Logger.info(`charge.dispute.created: ${stripeOrderEvent.event.id}`, loggerCtx);
    }

    async handleWebhookRefund(stripeOrderEvent: IStripeOrder): Promise<void> {
        const stripeObject = stripeOrderEvent.event.data.object as Stripe.Charge;
        Logger.info(`charge.refunded: ${stripeOrderEvent.event.id}`, loggerCtx);
    }

    async handleWebhookReviewOpened(stripeOrderEvent: IStripeOrder): Promise<void> {
        const stripeObject = stripeOrderEvent.event.data.object as Stripe.Review;
        Logger.info(`review.opened: ${stripeOrderEvent.event.id}`, loggerCtx);
    }

    async handleWebhookReviewClosed(stripeOrderEvent: IStripeOrder): Promise<void> {
        const stripeObject = stripeOrderEvent.event.data.object as Stripe.Review;
        Logger.info(`review.closed: ${stripeOrderEvent.event.id}`, loggerCtx);
    }

    async handleWebhookPaymentIntentSuccess(stripeOrderEvent: IStripeOrder): Promise<void> {
        const stripeObject = stripeOrderEvent.event.data.object as Stripe.PaymentIntent;
        Logger.info(
            `payment_intent.succeeded, payment_intent.payment_failed, payment_intent.amount_capturable_updated: ${stripeOrderEvent.event.id}`,
            loggerCtx,
        );
    }

    async handleWebhookSetupIntent(stripeOrderEvent: IStripeOrder): Promise<void> {
        const stripeObject = stripeOrderEvent.event.data.object as Stripe.PaymentIntent;
        Logger.info(
            `setup_intent.succeeded, setup_intent.setup_failed: ${stripeOrderEvent.event.id}`,
            loggerCtx,
        );
    }

    // Reference:
    // https://github.com/jonyw4/vendure-advanced-shipping/blob/e5c1fe9b34ac42e6827263ac9a27b2a0e4993255/packages/pickup-in-store/src/cron-service.ts
    private async createContext(): Promise<RequestContext> {
        const channel = await this.channelService.getDefaultChannel();

        return new RequestContext({
            apiType: 'admin',
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
            channel,
            languageCode: LanguageCode.en,
        });
    }

    // Reference:
    // https://github.com/vendure-ecommerce/vendure/blob/121b6fcd0c0ebf7d5a7fdb9fb671a234da8a38ca/packages/core/src/service/services/payment-method.service.ts
    private async getPaymentByTransactionId(transactionId: ID): Promise<Payment | undefined> {
        const payment = this.connection.getRepository(Payment).findOne({
            where: { transactionId: transactionId },
        });

        if (!payment) {
            Logger.error('Could not find Payment by transaction id.', loggerCtx);
            // Should we be using InternalServerError, or basic Error for throwing an error?
            // I believe EntityNotFoundError should be throw, this is due to the fact we couldn't
            // locate any record in the database.
            throw new EntityNotFoundError('Payment', transactionId);
        }

        return payment;
    }
}

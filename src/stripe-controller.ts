import { Controller, Post, Get, Req, Res } from '@nestjs/common';
import { InternalServerError, OrderService, PaymentMethod } from '@vendure/core';
import { loggerCtx } from './constants';
import { getGateway } from './stripe-common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';
import { PaymentMethodArgsHash } from './types';
import { stripePaymentMethodHandler } from './stripe-payment-methods';

@Controller('stripe')
export class StripeController {
    constructor(@InjectConnection() private connection: Connection, private orderService: OrderService) {}

    @Post('/webhook/')
    async index(@Req() req: any, @Res() res: any) {
        const args = await this.getPaymentMethodArgs();
        const stripe = getGateway(args);
        const sig = req.headers['stripe-signature'] as string;
        const endpointSecret = 'whsec_0JrpoNFCMhKHVeXG3uDz8wky4eJjuerF';
        let event: any;

        try {
            stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
            event = JSON.parse(req.body);
        } catch (err) {
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        // Handle the event
        switch (event.type) {
            case 'source.chargeable':
                await this.handleWebhookPayment(event.data.object);
                break;
            case 'source.canceled':
                await this.handleWebhookSourceCanceled(event.data.object);
                break;
            case 'charge.succeeded':
                await this.handleWebhookChargeSucceeded(event.data.object);
                break;
            case 'charge.failed':
                await this.handleWebhookChargeFailed(event.data.object);
                break;
            case 'charge.captured':
                await this.handleWebhookCapture(event.data.object);
                break;
            case 'charge.dispute.created':
                await this.handleWebhookDispute(event.data.object);
                break;
            case 'charge.refunded':
                await this.handleWebhookRefund(event.data.object);
                break;
            case 'review.opened':
                await this.handleWebhookReviewOpened(event.data.object);
                break;
            case 'review.closed':
                await this.handleWebhookReviewClosed(event.data.object);
                break;
            case 'payment_intent.succeeded':
            case 'payment_intent.payment_failed':
            case 'payment_intent.amount_capturable_updated':
                await this.handleWebhookPaymentIntentSuccess(event.data.object);
                break;
            case 'setup_intent.succeeded':
            case 'setup_intent.setup_failed':
                await this.handleWebhookSetupIntent(event.data.object);
                break;
            default:
                // Unexpected event type
                return res.status(400).end();
        }

        return { received: true };
    }

    // GET /v1/setup_intents/:id
    // GET /v1/setup_intents
    // @Get()
    private async getPaymentMethodArgs(): Promise<PaymentMethodArgsHash> {
        const method = await this.connection.getRepository(PaymentMethod).findOne({
            where: {
                code: stripePaymentMethodHandler.code,
            },
        });
        if (!method) {
            throw new InternalServerError(`[${loggerCtx}] Could not find Stripe PaymentMethod`);
        }
        return method.configArgs.reduce((hash, arg) => {
            return {
                ...hash,
                [arg.name]: arg.value,
            };
        }, {} as PaymentMethodArgsHash);
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-empty-function
    async handleWebhookPayment(object: any) {}

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-empty-function
    async handleWebhookSourceCanceled(object: any) {}

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-empty-function

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-empty-function
    async handleWebhookChargeSucceeded(object: any) {}

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-empty-function
    async handleWebhookChargeFailed(object: any) {}

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-empty-function
    async handleWebhookCapture(object: any) {}

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-empty-function
    async handleWebhookDispute(object: any) {}

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-empty-function
    async handleWebhookRefund(object: any) {}

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-empty-function
    async handleWebhookReviewOpened(object: any) {}

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-empty-function
    async handleWebhookReviewClosed(object: any) {}

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-empty-function
    private async handleWebhookPaymentIntentSuccess(object: any) {}

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-empty-function
    private async handleWebhookSetupIntent(object: any) {}
}

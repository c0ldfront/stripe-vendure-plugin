import http from 'http';
import { Payment, RequestContext } from '@vendure/core';
import { Stripe } from 'stripe';

export interface IRawBodyIncomingMessage extends http.IncomingMessage {
    rawBody: string;
}

export interface IStripeOrder {
    ctx: RequestContext;
    event: Stripe.Event;
    payment: Payment | undefined;
}

export interface IStripeWebhookResponse {
    received: boolean;
}

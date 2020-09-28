import Stripe from 'stripe';

import { PaymentMethodArgsHash } from './types';

export function getGateway(args: PaymentMethodArgsHash): Stripe {
    // Reference: https://github.com/stripe/stripe-node
    const stripeKey = args.stripeTestMode ? args.liveSecretKey : args.testSecretKey;
    return new Stripe(stripeKey, {
        apiVersion: '2020-08-27',
        appInfo: {
            name: 'VendureIOStripePlugin',
            version: '0.0.1',
            url: 'https://stripe.cryptic.dev',
        },
    });
}

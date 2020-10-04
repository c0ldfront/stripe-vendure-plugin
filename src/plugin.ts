import {
    AccountRegistrationEvent,
    EventBus,
    OnVendureBootstrap,
    OrderStateTransitionEvent,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import { LanguageCode } from '@vendure/common/lib/generated-types';
import { INestApplication } from '@nestjs/common';
import { json } from 'body-parser';

import cloneBuffer from 'clone-buffer';
import { stripePaymentMethodHandler } from './stripe-payment-methods';
import * as http from 'http';
import { IRawBodyIncomingMessage } from './interfaces';
import { StripeController } from './stripe-controller';
import { findStripeCustomerByEmail, getGateway } from './stripe-common';

/**
 * This plugin implements the Stripe (https://www.stripe.com/) payment provider.
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    controllers: [StripeController],

    configuration: (config: RuntimeVendureConfig) => {
        config.paymentOptions.paymentMethodHandlers.push(stripePaymentMethodHandler);
        config.customFields.Customer.push({
            name: 'stripeCustomerId',
            type: 'string',
            public: true,
            nullable: true,
        });
        return config;
    },
})
export class Plugin implements OnVendureBootstrap {
    static beforeVendureBootstrap(app: INestApplication): void | Promise<void> {
        // https://yanndanthu.github.io/2019/07/04/Checking-Stripe-Webhook-Signatures-from-NestJS.html
        app.use(
            json({
                verify(req: IRawBodyIncomingMessage, res: http.ServerResponse, buf: Buffer) {
                    if (req.headers['stripe-signature'] && Buffer.isBuffer(buf)) {
                        req.rawBody = cloneBuffer(buf);
                    }
                    return true;
                },
            }),
        );
    }

    async onVendureBootstrap(): Promise<void> {
        // this.eventBus.ofType(AccountRegistrationEvent).subscribe((account)=> {
        //     account.user.
        //
        // })
    }
}

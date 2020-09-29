import Stripe from 'stripe';

import { PaymentMethodArgsHash } from './types';
import { Connection } from 'typeorm';
import { InternalServerError, Logger, PaymentMethod } from '@vendure/core';
import { stripePaymentMethodHandler } from './stripe-payment-methods';
import { loggerCtx } from './constants';

export function getGateway(args: PaymentMethodArgsHash): Stripe {
    // Reference: https://github.com/stripe/stripe-node
    const stripeKey = args.stripeTestMode ? args.liveSecretKey : args.testSecretKey;

    if (!stripeKey) {
        Logger.error('Stripe key not provided.', loggerCtx);
        throw new InternalServerError(`[${loggerCtx}]: Stripe key not provided.`);
    }

    return new Stripe(stripeKey, {
        apiVersion: '2020-08-27',
        appInfo: {
            name: 'VendureIOStripePlugin',
            version: '1.0.0',
            url: 'https://github.com/c0ldfront/stripe-vendure-plugin',
        },
    });
}

export async function getPaymentMethodArgs(connection: Connection): Promise<PaymentMethodArgsHash> {
    const method = await connection.getRepository<PaymentMethod>(PaymentMethod).findOne({
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
            [arg.name]: checkType(arg.value),
        };
    }, {} as PaymentMethodArgsHash);
}

// I noticed when pulling the arguments outside of the PaymentMethodHandler all of the types casted as booleans.
// return as strings, this function is to check if the argValue is either true or false. If it is it will parse
// the string and return the boolean value. This could also become an issue if one of the values inside an argument,
// is either true or false and we want to keep it a string as true or false. When refactoring a new solution should be
// formed.
function checkType(argValue: string): any {
    if (argValue === 'true' || argValue === 'false') {
        return JSON.parse(argValue);
    }
    return argValue;
}

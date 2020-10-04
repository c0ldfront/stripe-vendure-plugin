import { Stripe } from 'stripe';

import { PaymentMethodArgsHash } from './types';
import { Connection } from 'typeorm';
import {
    InternalServerError,
    Logger,
    PaymentMethod,
    ConfigArgType,
    Customer,
    EntityNotFoundError,
} from '@vendure/core';
import { assertNever } from '@vendure/common/lib/shared-utils';
import { stripePaymentMethodHandler } from './stripe-payment-methods';
import { loggerCtx } from './constants';

export function getGateway(args: PaymentMethodArgsHash): Stripe {
    // Reference: https://github.com/stripe/stripe-node
    const stripeKey = !args.stripeTestMode ? args.liveSecretKey : args.testSecretKey;

    if (!stripeKey) {
        Logger.error('Stripe key not provided.', loggerCtx);
        throw new InternalServerError(`[${loggerCtx}]: Stripe key not provided.`);
    }

    return new Stripe(stripeKey, {
        apiVersion: '2020-08-27',
        appInfo: {
            name: 'StripeVendureIOPlugin',
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

// This function was pulled from the core module inside payment-method.service.ts.
// https://github.com/vendure-ecommerce/vendure/blob/121b6fcd0c0ebf7d5a7fdb9fb671a234da8a38ca/packages/core/src/service/services/payment-method.service.ts#L227
function getDefaultValue(type: ConfigArgType): string {
    switch (type) {
        case 'string':
            return '';
        case 'boolean':
            return 'false';
        case 'int':
        case 'float':
            return '0';
        case 'ID':
            return '';
        case 'datetime':
            return new Date().toISOString();
        default:
            assertNever(type);
            return '';
    }
}

export async function createStripeCustomer(
    stripeClient: Stripe,
    customer: Customer,
): Promise<Stripe.Customer> {
    let stripeCustomer;

    try {
        stripeCustomer = await stripeClient.customers.create({
            name: `${customer.firstName} ${customer.lastName}`,
            phone: `${customer.phoneNumber}`,
            email: `${customer.emailAddress}`,
        });
    } catch (e) {
        Logger.error(`Could not create new stripe customer ${customer.emailAddress}`, loggerCtx);
        throw new InternalServerError(`[${loggerCtx}] Could not create new stripe customer`);
    }

    Logger.info(`Successfully created new stripe customer ${customer.emailAddress}`, loggerCtx);
    return stripeCustomer;
}

export async function findStripeCustomerByEmail(
    gateway: Stripe,
    customer: Customer,
): Promise<Stripe.Customer | undefined> {
    const stripCustomers: Stripe.ApiList<Stripe.Customer> = await gateway.customers.list({
        email: customer.emailAddress,
        limit: 1,
    });

    if (stripCustomers.data.length <= 0) {
        Logger.info(`no stripe customer with ${customer.emailAddress} found.`, loggerCtx);
        return undefined;
        // throw new InternalServerError(`[${loggerCtx}] no stripe customer with ${email} found.`);
    }

    Logger.info(`Successfully found stripe customer ${customer.emailAddress}`, loggerCtx);

    return stripCustomers.data[0];
}

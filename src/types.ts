import { ConfigArgValues } from '@vendure/core/dist/common/configurable-operation';
import { stripePaymentMethodHandler } from './stripe-payment-methods';

export type PaymentMethodArgsHash = ConfigArgValues<typeof stripePaymentMethodHandler['args']>;

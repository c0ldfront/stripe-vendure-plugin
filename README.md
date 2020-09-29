# Stripe VendureIO plugin

This plugin enables payments to be processed by [Stripe](https://www.stripe.com/).

## Requirements

- ngx-stripe

## Notes

## Setup

```angular2html
<div [formGroup]="stripeTest">
    <ngx-stripe-card
        [options]="cardOptions"
        [elementsOptions]="elementsOptions"
    ></ngx-stripe-card>
    <button type="submit" (click)="pay()">
        PAY
    </button>
</div>
```

```typescript
pay() {
    if (this.stripeTest.valid) {
        this.stateService.select(state => state.activeOrderId).pipe(
            filter(notNullOrUndefined),
            switchMap(data => this.stripeService.createPaymentMethod({
                type: 'card',
                card: this.card.element,
            })),
            filter(notNullOrUndefined),
            switchMap(data => {
                return this.dataService.mutate<AddPayment.Mutation, AddPayment.Variables>(ADD_PAYMENT, {
                    input: {
                        method: 'stripe',
                        metadata: data,
                    },
                });
            }),
            map(data => {
                return data;
            }),
        ).subscribe(async data => {
            const order = data.addPaymentToOrder;
            if (order && (order.state === 'PaymentSettled' || order.state === 'PaymentAuthorized')) {
                await new Promise(resolve => setTimeout(() => {
                    this.stateService.setState('activeOrderId', null);
                    resolve();
                }, 500));
                await this.router.navigate(['../confirmation', order.code], {relativeTo: this.route});
            }
        });

    }
}
```

## Usage

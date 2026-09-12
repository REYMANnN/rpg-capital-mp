export const WEBHOOK_EVENT_TYPES=['product.created','product.updated','product.archived','inventory.movement.created','inventory.low_stock','sale.created','pricing.recommendation.created','pricing.price.changed','finance.transaction.created','finance.card_settlement.detected','integration.sync.completed','integration.sync.failed','webhook.test'] as const
export type WebhookEventType=typeof WEBHOOK_EVENT_TYPES[number]
export const WEBHOOK_EVENT_SET=new Set<string>(WEBHOOK_EVENT_TYPES)

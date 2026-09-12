import { createHmac, timingSafeEqual } from 'node:crypto'
export function signWebhookBody(secret:string,timestamp:string,body:string){ return `v1=${createHmac('sha256',secret).update(`${timestamp}.${body}`,'utf8').digest('hex')}` }
export function verifyWebhookSignature(secret:string,timestamp:string,body:string,signature:string){ const expected=Buffer.from(signWebhookBody(secret,timestamp,body)); const actual=Buffer.from(signature); return actual.length===expected.length&&timingSafeEqual(actual,expected) }

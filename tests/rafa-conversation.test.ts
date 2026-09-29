import assert from 'node:assert/strict'
import test from 'node:test'
import { confirmationTextId, fallbackTextForButtons } from '../lib/rafa-conversation.ts'
import { parseBatchPrices, parsePriceAnswer } from '../lib/rafa-price-flow.ts'
import { isMenuGreeting } from '../lib/whatsapp-router.ts'
const items=[{name:'Arroz Camil 5kg'},{name:'Feijao Kicaldo 1kg'},{name:'Leite Condensado Moca 395g'}]
test('parseBatchPrices lista na ordem',()=>assert.deepEqual(parseBatchPrices('50, 12, 23',items)?.prices.map(x=>x.cents),[5000,1200,2300]))
test('parseBatchPrices parcial na ordem',()=>assert.deepEqual(parseBatchPrices('50 12',items)?.prices.map(x=>x.cents),[5000,1200]))
test('parseBatchPrices nome + valor',()=>assert.deepEqual(parseBatchPrices('arroz 50 feijão 12',items)?.prices.map(x=>[x.index,x.cents]),[[0,5000],[1,1200]]))
test('parseBatchPrices indices',()=>assert.deepEqual(parseBatchPrices('1=50 3=23',items)?.prices.map(x=>[x.index,x.cents]),[[0,5000],[2,2300]]))
test('parseBatchPrices pula',()=>assert.deepEqual(parseBatchPrices('pula 2',items)?.skipped,[1]))
test('parseBatchPrices ignora conversa',()=>assert.equal(parseBatchPrices('quanto vendi hoje?',items),null))
test('parsePriceAnswer aceita reias',()=>assert.deepEqual(parsePriceAnswer('50 reias'),{kind:'price',cents:5000}))
test('parsePriceAnswer aceita R$',()=>assert.deepEqual(parsePriceAnswer('R$ 12,50'),{kind:'price',cents:1250}))
test('confirmacao textual',()=>{for(const x of ['sim','pode','👍'])assert.equal(confirmationTextId(x),'confirm_yes');for(const x of ['não','n'])assert.equal(confirmationTextId(x),'confirm_no');assert.equal(confirmationTextId('1'),null)})
test('fallback confirmacao sem numeros',()=>{const x=fallbackTextForButtons({body:'Confirma?',buttons:[{id:'confirm_yes',title:'Sim'},{id:'confirm_no',title:'Não'}]});assert.match(x,/Responde \*sim\* ou \*não\*/);assert.doesNotMatch(x,/1 -/)})
test('saudacao sozinha',()=>{assert.equal(isMenuGreeting('oi'),true);assert.equal(isMenuGreeting('Bom dia!'),true);assert.equal(isMenuGreeting('menu'),true);assert.equal(isMenuGreeting('oi, quanto vendi?'),false)})

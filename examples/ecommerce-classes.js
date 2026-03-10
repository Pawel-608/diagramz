import { diagram, palettes } from 'diagramz'
import { classShape } from 'diagramz/shapes/uml'
import { Sugiyama } from 'diagramz/layout'

const d = diagram('E-Commerce Platform', {
  colors: palettes.pastel,
  layout: new Sugiyama({ direction: 'TB', spacing: 120, layerSpacing: 160 }),
})

const order = d.add(classShape('Order', {
  fields: [
    { name: 'id', type: 'UUID', visibility: '-' },
    { name: 'items', type: 'OrderItem[]', visibility: '-' },
    { name: 'total', type: 'Money', visibility: '-' },
  ],
  methods: [
    { name: 'addItem', params: 'product, qty', returns: 'void' },
    { name: 'submit', returns: 'void' },
  ],
}))

const orderStatus = d.add(classShape('OrderStatus', {
  stereotype: 'enum',
  fields: [
    { name: 'DRAFT' },
    { name: 'SUBMITTED' },
    { name: 'PAID' },
    { name: 'SHIPPED' },
  ],
}))

const orderService = d.add(classShape('OrderService', {
  fields: [
    { name: 'repo', type: 'OrderRepository', visibility: '-' },
    { name: 'payment', type: 'PaymentGateway', visibility: '-' },
  ],
  methods: [
    { name: 'createOrder', params: 'cart', returns: 'Order' },
    { name: 'checkout', params: 'orderId', returns: 'Payment' },
  ],
}))

const orderRepo = d.add(classShape('OrderRepository', {
  stereotype: 'interface',
  methods: [
    { name: 'findById', params: 'id', returns: 'Order' },
    { name: 'save', params: 'order', returns: 'void' },
  ],
}))

const paymentGw = d.add(classShape('PaymentGateway', {
  stereotype: 'interface',
  methods: [
    { name: 'charge', params: 'amount', returns: 'Payment' },
    { name: 'refund', params: 'id', returns: 'void' },
  ],
}))

orderService.to(order, 'creates', { type: 'depend' })
orderService.to(orderRepo, '', { type: 'aggregate' })
orderService.to(paymentGw, '', { type: 'aggregate' })
order.to(orderStatus, '', { type: 'compose' })

export default d

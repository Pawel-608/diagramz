import { diagram, palettes } from 'diagramz'
import { c4Person, c4System, c4ExternalSystem } from 'diagramz/shapes/c4'
import { Sugiyama } from 'diagramz/layout'

const d = diagram('Internet Banking System - C4 Context', {
  colors: palettes.c4,
  layout: new Sugiyama({ direction: 'TB', spacing: 80, layerSpacing: 120 }),
})

const customer = d.add(c4Person('Customer', {
  description: 'A customer of the bank,\nwith personal bank accounts.',
}))

const bankingSystem = d.add(c4System('Internet Banking System', {
  description: 'Allows customers to view\nbank account information\nand make payments.',
}))

const emailSystem = d.add(c4ExternalSystem('E-Mail System', {
  description: 'The internal Microsoft\nExchange e-mail system.',
}))

const mainframe = d.add(c4ExternalSystem('Mainframe Banking System', {
  description: 'Stores all of the core\nbanking information.',
}))

customer.to(bankingSystem, 'Uses')
bankingSystem.to(emailSystem, 'Sends e-mails using')
bankingSystem.to(mainframe, 'Gets account info from')
emailSystem.to(customer, 'Sends e-mails to')

export default d

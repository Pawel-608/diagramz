import { diagram } from '../packages/sdk/dist/index.js'
import { rectangle, ellipse, diamond } from '../packages/sdk/dist/shapes/basic.js'

const d = diagram("My System")

const backend = d.group("Backend", { fillColor: "#e3f2fd" })
const api = backend.add(rectangle("API Server", { color: "#1565c0", fillColor: "#bbdefb" }))
const db = backend.add(ellipse("PostgreSQL", { color: "#2e7d32", fillColor: "#c8e6c9" }))
const cache = backend.add(diamond("Redis Cache", { color: "#e65100", fillColor: "#ffe0b2" }))

const frontend = d.group("Frontend", { fillColor: "#fce4ec" })
const web = frontend.add(rectangle("Web App", { color: "#ad1457", fillColor: "#f8bbd0" }))
const mobile = frontend.add(rectangle("Mobile App", { color: "#ad1457", fillColor: "#f8bbd0" }))

web.to(api, "REST API")
mobile.to(api, "GraphQL")
api.to(db, "queries")
api.to(cache, "get/set")

export default d

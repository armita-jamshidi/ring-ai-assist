// Lists the cameras on the Ring account, to fill in `cameras:` in config/assistant.yaml.
import { connectRing } from '../ring/ringClient.js'

const ring = connectRing()
const cameras = await ring.getCameras()
for (const c of cameras) {
  console.log(`- ${c.name}  (model: ${c.model}, doorbell: ${c.isDoorbot}, battery: ${c.hasBattery})`)
}
ring.disconnect()
process.exit(0)

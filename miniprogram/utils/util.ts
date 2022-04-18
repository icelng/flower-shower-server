import { Buffer } from 'buffer';

function ab2hex(buffer: Buffer): string {
  let hexArr = Array.prototype.map.call(
    new Uint8Array(buffer),
    function(bit) {
      return ('00' + bit.toString(16)).slice(-2)
    }
  )
  return hexArr.join('');
}

export async function getCharateristic(deviceId: string, servicdId: string, charId: string): Promise<WechatMiniprogram.BLECharacteristic> {
  var service: WechatMiniprogram.BLEService | undefined = undefined
  try {
    var services = (await wx.getBLEDeviceServices({deviceId: deviceId})).services
    for (let i = 0; i < services.length; i++) {
        if (services[i].uuid === servicdId) {
          service = services[i]
          console.log("get service: ", service)
        }
    }
  } catch (e) {
    console.log("Failed to get service!", e)
    throw e
  }

  if (service === undefined) { throw "Service not found!"}

  var charateristic: WechatMiniprogram.BLECharacteristic | undefined = undefined
  try {
    var characteristics = (await wx.getBLEDeviceCharacteristics({deviceId: deviceId, serviceId: service.uuid})).characteristics
    for (let i = 0; i < characteristics.length; i++) {
      if (characteristics[i].uuid === charId) {
        console.log("get magic char: ", characteristics[i])
        charateristic = characteristics[i]
      }
    }
  } catch(e) {
    console.log("Failed to get charateristic!", e)
    throw e
  }

  if (charateristic === undefined) { throw "Charateristic not found!" }

  return charateristic
}
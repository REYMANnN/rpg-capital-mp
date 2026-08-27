import InventoryV1 from './InventoryV1'
import BarcodeDetectorPolyfill from './BarcodeDetectorPolyfill'

export const metadata = {
  title: 'RPG Inventário V1',
  description: 'Inventário e checkout testável para mercadinhos',
}

export default function Page() {
  return (
    <>
      <BarcodeDetectorPolyfill />
      <InventoryV1 />
    </>
  )
}

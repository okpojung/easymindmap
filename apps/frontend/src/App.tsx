import EditorCanvas from './editor/canvas/EditorCanvas'

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#f4f4f5' }}>
      <EditorCanvas />
    </div>
  )
}
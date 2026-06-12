import { useMemo } from 'react'

export default function EditorCanvas() {
  const rootNode = useMemo(() => {
    return {
      id: 'root',
      x: 500,
      y: 300,
      text: 'EasyMindMap',
    }
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'white', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(to right, #f1f5f9 1px, transparent 1px),
            linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: rootNode.x,
          top: rootNode.y,
          transform: 'translate(-50%, -50%)',
          padding: '12px 24px',
          borderRadius: '16px',
          background: '#3b82f6',
          color: 'white',
          fontWeight: 700,
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        }}
      >
        {rootNode.text}
      </div>
    </div>
  )
}
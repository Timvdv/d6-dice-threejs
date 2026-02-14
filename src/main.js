import './style.css'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

const canvas = document.getElementById('c')
const rollBtn = document.getElementById('rollBtn')
const resultEl = document.getElementById('result')

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor(0x0b0f17, 1)

const scene = new THREE.Scene()

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
// More top-down angle so the top face is readable
camera.position.set(0, 2.4, 4.6)
camera.lookAt(0, 0.6, 0)

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.55))
const dir = new THREE.DirectionalLight(0xffffff, 1.25)
dir.position.set(3, 4, 2)
scene.add(dir)
const fill = new THREE.DirectionalLight(0x88aaff, 0.45)
fill.position.set(-3, -2, 2)
scene.add(fill)

// Ground glow (visual only)
const groundGlow = new THREE.Mesh(
  new THREE.CircleGeometry(6, 64),
  new THREE.MeshBasicMaterial({ color: 0x121a2a, transparent: true, opacity: 0.5 })
)
groundGlow.rotation.x = -Math.PI / 2
groundGlow.position.y = -0.51
scene.add(groundGlow)

function makeFaceTexture(n) {
  const size = 512
  const pad = 56
  const cnv = document.createElement('canvas')
  cnv.width = size
  cnv.height = size
  const ctx = cnv.getContext('2d')

  // background
  ctx.fillStyle = '#f6f2e8'
  ctx.fillRect(0, 0, size, size)

  // border
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = 14
  ctx.strokeRect(pad / 2, pad / 2, size - pad, size - pad)

  // pips
  const pip = (x, y) => {
    ctx.beginPath()
    ctx.arc(x, y, 36, 0, Math.PI * 2)
    ctx.fill()
  }

  const c = size / 2
  const o = 150
  const xs = [c - o, c, c + o]
  const ys = [c - o, c, c + o]

  ctx.fillStyle = '#111'

  // Standard dice pip layout
  const layouts = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [2, 0], [0, 2], [2, 2]],
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
    6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
  }

  for (const [xi, yi] of layouts[n]) pip(xs[xi], ys[yi])

  const tex = new THREE.CanvasTexture(cnv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
  return tex
}

// Face mapping: +X, -X, +Y, -Y, +Z, -Z
// Opposites sum to 7 on a standard die.
const faceNums = {
  px: 3,
  nx: 4,
  py: 5,
  ny: 2,
  pz: 1,
  nz: 6,
}

const faceByNormal = {
  py: faceNums.py,
  ny: faceNums.ny,
  px: faceNums.px,
  nx: faceNums.nx,
  pz: faceNums.pz,
  nz: faceNums.nz,
}

const materials = [
  new THREE.MeshStandardMaterial({ map: makeFaceTexture(faceNums.px), roughness: 0.35, metalness: 0.05 }),
  new THREE.MeshStandardMaterial({ map: makeFaceTexture(faceNums.nx), roughness: 0.35, metalness: 0.05 }),
  new THREE.MeshStandardMaterial({ map: makeFaceTexture(faceNums.py), roughness: 0.35, metalness: 0.05 }),
  new THREE.MeshStandardMaterial({ map: makeFaceTexture(faceNums.ny), roughness: 0.35, metalness: 0.05 }),
  new THREE.MeshStandardMaterial({ map: makeFaceTexture(faceNums.pz), roughness: 0.35, metalness: 0.05 }),
  new THREE.MeshStandardMaterial({ map: makeFaceTexture(faceNums.nz), roughness: 0.35, metalness: 0.05 }),
]

const geom = new THREE.BoxGeometry(1, 1, 1)
geom.computeVertexNormals()

const dice = new THREE.Mesh(geom, materials)
scene.add(dice)

// Edges outline
const edges = new THREE.LineSegments(
  new THREE.EdgesGeometry(geom, 35),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })
)
dice.add(edges)

// --- Rapier physics ---
await RAPIER.init()

const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

// Tray: floor + 4 walls (colliders)
const tray = {
  size: 3.2, // inner size
  wallH: 0.7,
  thick: 0.2,
}

function fixedCollider(desc) {
  world.createCollider(desc)
}

// Floor at y=0
fixedCollider(
  RAPIER.ColliderDesc.cuboid(tray.size / 2, tray.thick / 2, tray.size / 2)
    .setTranslation(0, -tray.thick / 2, 0)
    .setFriction(1.0)
)

// Walls around the tray
const half = tray.size / 2
const w = tray.thick / 2
const h = tray.wallH / 2
fixedCollider(RAPIER.ColliderDesc.cuboid(w, h, half).setTranslation(half + w, h, 0).setFriction(0.9))
fixedCollider(RAPIER.ColliderDesc.cuboid(w, h, half).setTranslation(-half - w, h, 0).setFriction(0.9))
fixedCollider(RAPIER.ColliderDesc.cuboid(half, h, w).setTranslation(0, h, half + w).setFriction(0.9))
fixedCollider(RAPIER.ColliderDesc.cuboid(half, h, w).setTranslation(0, h, -half - w).setFriction(0.9))

// Dice rigid body + collider
const diceBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 1.2, 0)
    .setLinearDamping(0.25)
    .setAngularDamping(0.35)
)

world.createCollider(
  RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
    .setRestitution(0.35)
    .setFriction(0.85),
  diceBody
)

// Input: drag applies angular velocity
let isDown = false
let lastX = 0
let lastY = 0

function onDown(x, y) {
  isDown = true
  lastX = x
  lastY = y
}
function onMove(x, y) {
  if (!isDown) return
  const dx = x - lastX
  const dy = y - lastY
  lastX = x
  lastY = y

  const rotSpeed = 0.02
  const av = diceBody.angvel()
  diceBody.setAngvel({ x: av.x + dy * rotSpeed, y: av.y + dx * rotSpeed, z: av.z }, true)
  diceBody.wakeUp()
}
function onUp() { isDown = false }

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId)
  onDown(e.clientX, e.clientY)
})
canvas.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY))
canvas.addEventListener('pointerup', onUp)
canvas.addEventListener('pointercancel', onUp)

// Double-tap reset
let lastTap = 0
canvas.addEventListener('pointerdown', () => {
  const now = performance.now()
  if (now - lastTap < 350) resetDice()
  lastTap = now
})

function resetDice() {
  diceBody.setTranslation({ x: 0, y: 1.2, z: 0 }, true)
  diceBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
  diceBody.setAngvel({ x: 0, y: 0, z: 0 }, true)
  diceBody.wakeUp()
  if (resultEl) resultEl.textContent = 'Result: —'
}

function startRoll() {
  // Random throw: upward impulse + random torque
  const impulseY = 6 + Math.random() * 6
  const impulseX = (Math.random() - 0.5) * 1.5
  const impulseZ = (Math.random() - 0.5) * 1.5

  // Reset to above center with slight random offset
  diceBody.setTranslation({ x: (Math.random() - 0.5) * 0.4, y: 1.2, z: (Math.random() - 0.5) * 0.4 }, true)
  diceBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
  diceBody.setAngvel({ x: 0, y: 0, z: 0 }, true)

  diceBody.applyImpulse({ x: impulseX, y: impulseY, z: impulseZ }, true)
  diceBody.applyTorqueImpulse(
    {
      x: (Math.random() - 0.5) * 12,
      y: (Math.random() - 0.5) * 12,
      z: (Math.random() - 0.5) * 12,
    },
    true
  )

  diceBody.wakeUp()
  if (resultEl) resultEl.textContent = 'Result: …'
}

rollBtn?.addEventListener('click', startRoll)

function getTopFaceValue() {
  const q = dice.quaternion
  const up = new THREE.Vector3(0, 1, 0)

  const normals = {
    py: new THREE.Vector3(0, 1, 0),
    ny: new THREE.Vector3(0, -1, 0),
    px: new THREE.Vector3(1, 0, 0),
    nx: new THREE.Vector3(-1, 0, 0),
    pz: new THREE.Vector3(0, 0, 1),
    nz: new THREE.Vector3(0, 0, -1),
  }

  let bestKey = 'py'
  let bestDot = -Infinity
  for (const [k, n] of Object.entries(normals)) {
    const wn = n.clone().applyQuaternion(q)
    const d = wn.dot(up)
    if (d > bestDot) {
      bestDot = d
      bestKey = k
    }
  }
  return faceByNormal[bestKey]
}

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

let lastT = performance.now()
let settleFrames = 0
function animate(t = performance.now()) {
  requestAnimationFrame(animate)
  const dt = Math.min((t - lastT) / 1000, 1 / 30)
  lastT = t

  world.timestep = dt
  world.step()

  // Sync Three mesh from Rapier body
  const p = diceBody.translation()
  const r = diceBody.rotation()
  dice.position.set(p.x, p.y, p.z)
  dice.quaternion.set(r.x, r.y, r.z, r.w)

  // Detect settle: low velocity for a short while
  const lv = diceBody.linvel()
  const av = diceBody.angvel()
  const speed = Math.abs(lv.x) + Math.abs(lv.y) + Math.abs(lv.z)
  const spin = Math.abs(av.x) + Math.abs(av.y) + Math.abs(av.z)

  if (speed < 0.03 && spin < 0.03 && p.y < 0.7) settleFrames++
  else settleFrames = 0

  if (settleFrames === 20) {
    const value = getTopFaceValue()
    if (resultEl) resultEl.textContent = `Result: ${value}`
  }

  renderer.render(scene, camera)
}
animate()

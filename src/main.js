import './style.css'
import * as THREE from 'three'

const canvas = document.getElementById('c')
const rollBtn = document.getElementById('rollBtn')

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor(0x0b0f17, 1)

const scene = new THREE.Scene()

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
camera.position.set(0, 0.6, 3)

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.5))
const dir = new THREE.DirectionalLight(0xffffff, 1.2)
dir.position.set(3, 4, 2)
scene.add(dir)
const fill = new THREE.DirectionalLight(0x88aaff, 0.5)
fill.position.set(-3, -2, 2)
scene.add(fill)

// Ground glow
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(3, 64),
  new THREE.MeshBasicMaterial({ color: 0x121a2a, transparent: true, opacity: 0.6 })
)
ground.rotation.x = -Math.PI / 2
ground.position.y = -1.05
scene.add(ground)

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
// Make opposite faces sum to 7 on a standard die:
// 1 opposite 6, 2 opposite 5, 3 opposite 4
const faceNums = {
  px: 3,
  nx: 4,
  py: 5,
  ny: 2,
  pz: 1,
  nz: 6,
}

const materials = [
  new THREE.MeshStandardMaterial({ map: makeFaceTexture(faceNums.px), roughness: 0.35, metalness: 0.05 }),
  new THREE.MeshStandardMaterial({ map: makeFaceTexture(faceNums.nx), roughness: 0.35, metalness: 0.05 }),
  new THREE.MeshStandardMaterial({ map: makeFaceTexture(faceNums.py), roughness: 0.35, metalness: 0.05 }),
  new THREE.MeshStandardMaterial({ map: makeFaceTexture(faceNums.ny), roughness: 0.35, metalness: 0.05 }),
  new THREE.MeshStandardMaterial({ map: makeFaceTexture(faceNums.pz), roughness: 0.35, metalness: 0.05 }),
  new THREE.MeshStandardMaterial({ map: makeFaceTexture(faceNums.nz), roughness: 0.35, metalness: 0.05 }),
]

const geom = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1)
// Slight bevel illusion using normal smoothing + edges
geom.computeVertexNormals()

const dice = new THREE.Mesh(geom, materials)
scene.add(dice)

// Dice "physics" (simple toy physics)
const physics = {
  active: false,
  posY: 0,
  velY: 0,
  angVel: new THREE.Vector3(),
  targetQuat: new THREE.Quaternion(),
  settleT: 0,
}

// Edges outline
const edges = new THREE.LineSegments(
  new THREE.EdgesGeometry(geom, 35),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })
)
dice.add(edges)

// Interaction (touch + mouse drag)
let isDown = false
let lastX = 0
let lastY = 0
let velX = 0
let velY = 0

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

  // rotate cube
  const rotSpeed = 0.008
  dice.rotation.y += dx * rotSpeed
  dice.rotation.x += dy * rotSpeed

  velX = dx * rotSpeed
  velY = dy * rotSpeed
}
function onUp() {
  isDown = false
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId)
  onDown(e.clientX, e.clientY)
})
canvas.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY))
canvas.addEventListener('pointerup', onUp)
canvas.addEventListener('pointercancel', onUp)

let lastTap = 0
canvas.addEventListener('pointerdown', () => {
  const now = performance.now()
  if (now - lastTap < 350) {
    dice.rotation.set(0.35, 0.6, 0)
    velX = velY = 0
  }
  lastTap = now
})

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

dice.rotation.set(0.35, 0.6, 0)

// Precomputed orientations for a cube with a given face UP (+Y).
// We only care that the top face result matches a D6 value.
const faceByNormal = {
  py: faceNums.py,
  ny: faceNums.ny,
  px: faceNums.px,
  nx: faceNums.nx,
  pz: faceNums.pz,
  nz: faceNums.nz,
}

function quatToPutNormalUp(key) {
  // rotates cube so that the given local normal points to world +Y
  switch (key) {
    case 'py': return new THREE.Quaternion() // already up
    case 'ny': return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
    case 'px': return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2)
    case 'nx': return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
    case 'pz': return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    case 'nz': return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
    default: return new THREE.Quaternion()
  }
}

const topKeys = ['py', 'ny', 'px', 'nx', 'pz', 'nz']

function randomRollTargetQuaternion() {
  // Pick which face ends UP
  const upKey = topKeys[Math.floor(Math.random() * topKeys.length)]
  const base = quatToPutNormalUp(upKey)

  // Random spin around world up axis so the dice can land with different yaw
  const yaw = (Math.PI / 2) * Math.floor(Math.random() * 4)
  const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)

  return {
    quat: qYaw.multiply(base),
    value: faceByNormal[upKey],
  }
}

function startRoll() {
  if (physics.active) return

  physics.active = true
  physics.posY = 0
  physics.velY = 2.2 + Math.random() * 2.2 // throw height
  physics.angVel.set(
    (Math.random() - 0.5) * 14,
    (Math.random() - 0.5) * 14,
    (Math.random() - 0.5) * 14,
  )

  const { quat, value } = randomRollTargetQuaternion()
  physics.targetQuat.copy(quat)
  physics.settleT = 0

  // Update button label briefly
  rollBtn.textContent = 'Rolling…'
  rollBtn.disabled = true
  setTimeout(() => {
    rollBtn.textContent = `Roll (last: ${value})`
  }, 500)
}

rollBtn?.addEventListener('click', startRoll)

let lastT = performance.now()
function animate(t = performance.now()) {
  requestAnimationFrame(animate)
  const dt = Math.min((t - lastT) / 1000, 1 / 30)
  lastT = t

  // User drag inertia only when not rolling
  if (!physics.active && !isDown) {
    dice.rotation.y += velX
    dice.rotation.x += velY
    velX *= 0.92
    velY *= 0.92
  }

  // Toy physics roll
  if (physics.active) {
    // gravity
    physics.velY += -9.8 * dt
    physics.posY += physics.velY * dt

    // bounce on "ground" at y=0
    if (physics.posY < 0) {
      physics.posY = 0
      physics.velY = Math.abs(physics.velY) * (0.45 + Math.random() * 0.05)
      physics.angVel.multiplyScalar(0.85)

      // when low energy, start settling
      const energy = Math.abs(physics.velY) + physics.angVel.length() * 0.02
      if (energy < 0.35) {
        physics.settleT += dt * 1.4
      }
    }

    // apply angular velocity
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        physics.angVel.x * dt,
        physics.angVel.y * dt,
        physics.angVel.z * dt,
        'XYZ'
      )
    )
    dice.quaternion.multiply(q)

    // move dice
    dice.position.y = physics.posY

    // settle towards a valid final orientation
    if (physics.settleT > 0) {
      const a = THREE.MathUtils.clamp(physics.settleT, 0, 1)
      dice.quaternion.slerp(physics.targetQuat, a)

      // finish
      if (a >= 1) {
        physics.active = false
        dice.position.y = 0
        rollBtn.disabled = false
        rollBtn.textContent = 'Roll'
      }
    }
  }

  renderer.render(scene, camera)
}
animate()

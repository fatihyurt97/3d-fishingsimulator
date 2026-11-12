import * as THREE from 'three';
import { DOCK } from './config.js';

// Sağ kolun iskelet pozu (radyan). Olta kolunun ucuna bağlanır.
export const ARM_POSE = 1.0;

const mats = {
  cloth: new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.9 }),
  pants: new THREE.MeshStandardMaterial({ color: 0x2d3e5c, roughness: 0.92 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xe8b98f, roughness: 0.6 }),
  hat: new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: 0.85 }),
  boot: new THREE.MeshStandardMaterial({ color: 0x2a2220, roughness: 0.5 }),
};

// Düşük poligonlu balıkçı. root: iskelede duran karakter. hand: olta tutulan nokta.
export function buildAvatar(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

  const torso = box(0.5, 0.7, 0.3, mats.cloth);
  torso.position.y = 1.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 9), mats.skin);
  head.position.y = 1.85;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 14), mats.hat);
  brim.position.y = 1.98;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.2, 12), mats.hat);
  crown.position.y = 2.1;
  root.add(torso, head, brim, crown);

  // Bacaklar (kalça pivotlu, yürürken sallanır)
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.13, 0.9, 0);
    const leg = box(0.17, 0.85, 0.2, mats.pants);
    leg.position.y = -0.425;
    const boot = box(0.18, 0.12, 0.26, mats.boot);
    boot.position.set(0, -0.86, 0.03);
    hip.add(leg, boot);
    root.add(hip);
    legs.push(hip);
  }

  // Sol kol (sarkık)
  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(-0.36, 1.5, 0);
  const leftArm = box(0.14, 0.62, 0.16, mats.cloth);
  leftArm.position.y = -0.31;
  leftShoulder.add(leftArm);
  root.add(leftShoulder);

  // Sağ kol (olta kolu): öne uzanır, uç noktası hand
  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(0.36, 1.5, 0);
  rightShoulder.rotation.x = ARM_POSE;
  const rightArm = box(0.14, 0.62, 0.16, mats.cloth);
  rightArm.position.y = -0.31;
  rightShoulder.add(rightArm);
  const hand = new THREE.Object3D();
  hand.position.set(0, -0.62, 0);
  rightShoulder.add(hand);
  root.add(rightShoulder);

  // Tüm parçalar gölge atar
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  rightShoulder.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const baseY = DOCK.deckY + 0.06;
  let breathT = 0;
  return {
    root,
    hand,
    // Karakteri oyuncu konumuna ve yönüne taşır. aim: nişan açısı (0 = gölün tam karşısı)
    setPose({ x, z, aim }, t, moving) {
      root.position.set(x, baseY, z);
      root.rotation.y = -aim;
      const swing = moving ? Math.sin(t * 9) * 0.55 : 0;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      breathT = t;
      root.position.y = baseY + (moving ? Math.abs(Math.sin(t * 9)) * 0.03 : Math.sin(breathT * 2) * 0.01);
    },
  };
}

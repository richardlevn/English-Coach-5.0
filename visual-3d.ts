
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Analyser} from './analyser';

interface Point3D {
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  baseZ: number;
}

/**
 * Sci-Fi Network Visualizer
 * Idle: Slow rotation, static size.
 * Active: Pulse size with audio, dynamic color.
 */
@customElement('gdm-live-audio-visuals-3d')
export class GdmLiveAudioVisuals3D extends LitElement {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animationId: number = 0;
  private nodes: Point3D[] = [];
  
  private readonly NODE_COUNT = 100;
  private readonly CONNECTION_DIST = 100;
  
  // Analysers
  private inputAnalyser?: Analyser;
  private outputAnalyser?: Analyser;

  // State
  private currentVolume = 0;
  private rotationAngle = 0;
  private currentColor = {r: 0, g: 243, b: 255}; // Default Cyan

  private _inputNode: AudioNode | null = null;
  @property({attribute: false})
  set inputNode(node: AudioNode | null) {
    this._inputNode = node;
    if (node) this.inputAnalyser = new Analyser(node);
  }
  get inputNode() { return this._inputNode; }

  private _outputNode: AudioNode | null = null;
  @property({attribute: false})
  set outputNode(node: AudioNode | null) {
    this._outputNode = node;
    if (node) this.outputAnalyser = new Analyser(node);
  }
  get outputNode() { return this._outputNode; }

  @property({type: Boolean}) isError = false;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      z-index: 0;
      background-color: transparent;
      pointer-events: none;
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
  `;

  constructor() {
    super();
    this.initNodes();
  }

  private initNodes() {
    this.nodes = [];
    for (let i = 0; i < this.NODE_COUNT; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos((Math.random() * 2) - 1);
      const radius = 220; // Base size

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      this.nodes.push({ x, y, z, baseX: x, baseY: y, baseZ: z });
    }
  }

  protected firstUpdated() {
    this.canvas = this.renderRoot.querySelector('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.resizeCanvas();
    window.addEventListener('resize', this.resizeCanvas.bind(this));
    this.runAnimation();
  }

  private resizeCanvas() {
    if (this.canvas) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
  }

  private getAverageVolume(analyser?: Analyser): number {
    if (!analyser) return 0;
    analyser.update();
    const data = analyser.data;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return (sum / data.length) / 255;
  }

  private runAnimation() {
    this.animationId = requestAnimationFrame(this.runAnimation.bind(this));
    this.renderVisuals();
  }

  private renderVisuals() {
    if (!this.ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    // 1. Get Audio Data
    const inputVol = this.getAverageVolume(this.inputAnalyser);
    const outputVol = this.getAverageVolume(this.outputAnalyser);
    
    // 2. Logic for State
    let targetVol = 0;
    let targetR = 0, targetG = 243, targetB = 255; // Default Cyan

    const threshold = 0.05; // Noise floor

    if (this.isError) {
       // Red Error State
       targetR = 255; targetG = 50; targetB = 50;
       targetVol = 0.3; // Slight pulse for visibility
    } else if (inputVol > threshold) {
       // User Speaking -> Green
       targetR = 0; targetG = 255; targetB = 65;
       targetVol = inputVol;
    } else if (outputVol > threshold) {
       // Bot Speaking -> Blue
       targetR = 0; targetG = 168; targetB = 255;
       targetVol = outputVol;
    } else {
       // Idle -> Cyan
       targetR = 0; targetG = 243; targetB = 255;
       targetVol = 0; // Stationary size (Volume 0 implies scale 1.0)
    }

    // 3. Smooth Transitions
    this.currentVolume += (targetVol - this.currentVolume) * 0.2;
    
    this.currentColor.r += (targetR - this.currentColor.r) * 0.1;
    this.currentColor.g += (targetG - this.currentColor.g) * 0.1;
    this.currentColor.b += (targetB - this.currentColor.b) * 0.1;

    // 4. Update Rotation
    // Rotate slowly when idle (0.002), faster when active
    const rotationSpeed = 0.002 + (this.currentVolume * 0.02);
    this.rotationAngle += rotationSpeed;

    // 5. Clear
    this.ctx.clearRect(0, 0, w, h);

    // 6. Draw
    const cos = Math.cos(this.rotationAngle);
    const sin = Math.sin(this.rotationAngle);
    
    // Scale factor: 1.0 (idle) + volume bump
    // "phóng to thu nhỏ theo cường độ" -> idle = 1, speaking = >1
    const scale = 1 + (this.currentVolume * 0.8);

    const projectedNodes: {x: number, y: number}[] = [];

    // Projection
    this.nodes.forEach(node => {
        // Rotate Y
        let x = node.baseX * cos - node.baseZ * sin;
        let z = node.baseZ * cos + node.baseX * sin;
        let y = node.baseY;

        // Rotate X (Tumble)
        const tumble = this.rotationAngle * 0.5;
        const cosT = Math.cos(tumble);
        const sinT = Math.sin(tumble);
        
        let y2 = y * cosT - z * sinT;
        let z2 = z * cosT + y * sinT;

        // Apply Expansion Scale
        x *= scale;
        y2 *= scale;
        z2 *= scale;

        // Perspective
        const fov = 400; 
        const viewDist = 500;
        const pScale = fov / (viewDist + z2);
        
        projectedNodes.push({
            x: x * pScale + cx,
            y: y2 * pScale + cy
        });
    });

    // Draw Lines
    const colorStr = `rgb(${this.currentColor.r}, ${this.currentColor.g}, ${this.currentColor.b})`;
    this.ctx.strokeStyle = `rgba(${this.currentColor.r}, ${this.currentColor.g}, ${this.currentColor.b}, 0.2)`;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    
    for (let i = 0; i < this.NODE_COUNT; i++) {
        for (let j = i + 1; j < this.NODE_COUNT; j++) {
            const p1 = projectedNodes[i];
            const p2 = projectedNodes[j];
            
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const distSq = dx*dx + dy*dy;

            // Connect if close (distance threshold adjusted for scale)
            if (distSq < (this.CONNECTION_DIST * scale) ** 2) {
                this.ctx.moveTo(p1.x, p1.y);
                this.ctx.lineTo(p2.x, p2.y);
            }
        }
    }
    this.ctx.stroke();

    // Draw Nodes
    this.ctx.fillStyle = colorStr;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = colorStr;
    
    for (let i = 0; i < this.NODE_COUNT; i++) {
        const p = projectedNodes[i];
        const size = 2 * scale; 
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        this.ctx.fill();
    }
    this.ctx.shadowBlur = 0;
  }

  render() {
    return html`<canvas></canvas>`;
  }
}

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers, Timer, CheckCircle, FileText, Gem, Target, BookOpen,
  Swords, Users, HelpCircle, Zap, Flame, Lock, Sparkles,
  Star, TrendingUp, Award, CircleDot,
} from "lucide-react";
import "./App.css";

// ═══════════════════════════════════════════════════════════
//  VOX RPG SKILL TREE v4 — HTML Nodes + SVG Lines
// ═══════════════════════════════════════════════════════════

// ─── Geometry ────────────────────────────────────────────

// ─── Types ───────────────────────────────────────────────
interface NodeData {
  id: string; title: string; description: string; icon: string;
  xp: number; maxXp: number; uses: number; level: number; unlocked: boolean;
  x: number; y: number; parentX: number; parentY: number;
}

interface Constellation {
  id: string; title: string; color: string; glowColor: string;
  icon: string; cx: number; cy: number; nodes: NodeData[];
}

// ─── Icon Map ────────────────────────────────────────────
const iconMap: Record<string, React.ReactNode> = {
  layers: <Layers size={17} />, timer: <Timer size={17} />, check: <CheckCircle size={17} />,
  file: <FileText size={17} />, gem: <Gem size={17} />, target: <Target size={17} />,
  book: <BookOpen size={17} />, swords: <Swords size={17} />, users: <Users size={17} />,
  help: <HelpCircle size={17} />,
};

// ─── Data ────────────────────────────────────────────────
const constellations: Constellation[] = [
  {
    id: "resumo", title: "RESUMO", color: "#00e5ff", glowColor: "rgba(0,229,255,0.3)",
    icon: "layers", cx: 18, cy: 20,
    nodes: [
      { id: "piramide", title: "Resumo Pirâmide", description: "Frase → parágrafo → tópicos", icon: "layers", xp: 340, maxXp: 500, uses: 12, level: 3, unlocked: true,  x: 18, y: 44, parentX: 18, parentY: 20 },
      { id: "pitch",    title: "Pitch 30s",       description: "A ideia em 30 segundos",      icon: "timer",  xp: 180, maxXp: 500, uses: 5,  level: 2, unlocked: true,  x: 34, y: 50, parentX: 18, parentY: 20 },
    ],
  },
  {
    id: "estrutura", title: "ESTRUTURA", color: "#ffd600", glowColor: "rgba(255,214,0,0.3)",
    icon: "gem", cx: 50, cy: 16,
    nodes: [
      { id: "corretor", title: "Corretor Mínimo", description: "Gramática sem mudar conteúdo", icon: "check", xp: 420, maxXp: 500, uses: 18, level: 4, unlocked: true,  x: 50, y: 40, parentX: 50, parentY: 16 },
      { id: "soap",     title: "Nota SOAP",       description: "Padrão clínico S/O/A/P",       icon: "file",  xp: 90,  maxXp: 500, uses: 2,  level: 1, unlocked: true,  x: 66, y: 30, parentX: 50, parentY: 16 },
      { id: "obsidian", title: "Nota Obsidian",   description: "Títulos, negrito e listas",    icon: "gem",   xp: 250, maxXp: 500, uses: 8,  level: 2, unlocked: true,  x: 34, y: 30, parentX: 50, parentY: 16 },
    ],
  },
  {
    id: "extracao", title: "EXTRAÇÃO", color: "#76ff03", glowColor: "rgba(118,255,3,0.3)",
    icon: "target", cx: 82, cy: 20,
    nodes: [
      { id: "decisoes",   title: "Decisões & Ações", description: "Quem faz o quê e quando", icon: "target", xp: 310, maxXp: 500, uses: 9, level: 3, unlocked: true,  x: 82, y: 44, parentX: 82, parentY: 20 },
      { id: "flashcards", title: "Flashcards",       description: "Perguntas e respostas",   icon: "book",   xp: 150, maxXp: 500, uses: 4, level: 1, unlocked: true,  x: 66, y: 50, parentX: 82, parentY: 20 },
    ],
  },
  {
    id: "desafiar", title: "DESAFIAR", color: "#e040fb", glowColor: "rgba(224,64,251,0.3)",
    icon: "swords", cx: 50, cy: 76,
    nodes: [
      { id: "advogado",   title: "Advogado do Diabo",   description: "Ataques + blindagem",       icon: "swords", xp: 200, maxXp: 500, uses: 6, level: 2, unlocked: true,  x: 34, y: 60, parentX: 50, parentY: 76 },
      { id: "mesa",       title: "Mesa-redonda",        description: "Debate de especialistas",   icon: "users",  xp: 60,  maxXp: 500, uses: 1, level: 1, unlocked: true,  x: 66, y: 60, parentX: 50, parentY: 76 },
      { id: "socraticas", title: "Perguntas Socráticas", description: "Premissas ocultas",         icon: "help",   xp: 0,   maxXp: 500, uses: 0, level: 0, unlocked: false, x: 50, y: 52, parentX: 50, parentY: 76 },
    ],
  },
];

const allNodes = constellations.flatMap(c => c.nodes);
const totalXp = allNodes.reduce((s, n) => s + n.xp, 0);
const globalLevel = Math.floor(totalXp / 500) + 1;
const nextLevelXp = globalLevel * 500;

// ─── Particles ───────────────────────────────────────────
interface Particle { id: number; x: number; y: number; color: string; size: number; duration: number; }

function BackgroundParticles() {
  const [particles] = useState<Particle[]>(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i, x: Math.random() * 100, y: Math.random() * 100,
      color: ["#00e5ff", "#ffd600", "#76ff03", "#e040fb", "#fff"][Math.floor(Math.random() * 5)],
      size: Math.random() * 2 + 0.5, duration: Math.random() * 14 + 10,
    }))
  );
  return (
    <div className="particles-container">
      {particles.map(p => (
        <motion.div key={p.id} className="particle"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, backgroundColor: p.color }}
          animate={{ y: [0, -25, 0], x: [0, Math.random() * 14 - 7, 0], opacity: [0, 0.5, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, ease: "easeInOut", delay: Math.random() * 5 }} />
      ))}
    </div>
  );
}

// ─── SVG Lines Layer ─────────────────────────────────────
function SVGLines() {
  const allLines: { x1: number; y1: number; x2: number; y2: number; color: string; delay: number }[] = [];

  // Per-constellation lines
  constellations.forEach((c, ci) =>
    c.nodes.forEach((node, ni) => {
      allLines.push({ x1: c.cx, y1: c.cy, x2: node.x, y2: node.y, color: c.color, delay: ci * 0.3 + ni * 0.12 });
    })
  );

  // Cross connections
  const cross = [
    { x1: 18, y1: 20, x2: 34, y2: 60, color: "#00e5ff" },
    { x1: 50, y1: 16, x2: 50, y2: 52, color: "#ffd600" },
    { x1: 82, y1: 20, x2: 66, y2: 60, color: "#76ff03" },
  ];
  cross.forEach((cc, i) => allLines.push({ ...cc, delay: 1.2 + i * 0.25 }));

  return (
    <svg className="svg-lines-layer" viewBox="0 0 100 90" preserveAspectRatio="none">
      {allLines.map((line, i) => (
        <g key={i}>
          <line x1={`${line.x1}%`} y1={`${line.y1}%`} x2={`${line.x2}%`} y2={`${line.y2}%`}
            stroke={line.color} strokeWidth="0.7" opacity="0.1" />
          <motion.line x1={`${line.x1}%`} y1={`${line.y1}%`} x2={`${line.x2}%`} y2={`${line.y2}%`}
            stroke={line.color} strokeWidth="1.2" strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: [0, 1, 0], opacity: [0, 0.4, 0] }}
            transition={{ duration: 2.5, delay: line.delay, repeat: Infinity, ease: "easeInOut" }} />
        </g>
      ))}
    </svg>
  );
}

// ─── Skill Node (HTML div) ───────────────────────────────
function SkillNode({ node, color, glowColor, onActivate }: {
  node: NodeData; color: string; glowColor: string;
  onActivate: (x: number, y: number, color: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [activated, setActivated] = useState(false);
  const progress = node.unlocked ? (node.xp / node.maxXp) * 100 : 0;
  const R = 22; // ring radius in px
  const circumference = 2 * Math.PI * R;
  const strokeOffset = circumference - (progress / 100) * circumference;

  const handleClick = () => {
    if (!node.unlocked) return;
    setActivated(true);
    onActivate(node.x, node.y, color);
    setTimeout(() => setActivated(false), 600);
  };

  return (
    <div
      className={`node-wrapper ${!node.unlocked ? "locked" : ""}`}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      onMouseEnter={() => node.unlocked && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
    >
      {/* Hover glow ring */}
      {hovered && node.unlocked && (
        <motion.div className="node-hover-glow"
          style={{ borderColor: color }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0, 0.25, 0], scale: [0.8, 1.3, 1.6] }}
          transition={{ duration: 1.1, repeat: Infinity }} />
      )}

      {/* Burst on click */}
      {activated && [0, 1, 2].map(i => (
        <motion.div key={i} className="node-burst-ring"
          style={{ borderColor: color }}
          initial={{ opacity: 0.7, scale: 0.5 }}
          animate={{ opacity: 0, scale: 2 }}
          transition={{ duration: 0.45, delay: i * 0.05 }} />
      ))}

      {/* Progress ring (inline SVG) */}
      <svg className="node-progress-svg" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={R} fill="none" stroke={color} strokeWidth="2.5" opacity="0.1" />
        {node.unlocked && (
          <motion.circle cx="26" cy="26" r={R} fill="none" stroke={color} strokeWidth="3"
            strokeLinecap="round" strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: strokeOffset }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            transform="rotate(-90 26 26)" />
        )}
      </svg>

      {/* Main circle body */}
      <motion.div className="node-body"
        style={{
          borderColor: node.unlocked ? color : "#2a2a3a",
          background: node.unlocked ? "#0c0c16" : "#131320",
          boxShadow: hovered && node.unlocked ? `0 0 20px ${glowColor}, inset 0 0 6px ${glowColor}`
            : node.unlocked ? `0 0 6px ${glowColor}` : "none",
        }}
        animate={{ scale: hovered && node.unlocked ? 1.1 : 1 }}
        transition={{ type: "spring", stiffness: 400 }}>
        <span style={{ color: node.unlocked ? color : "#3a3a4c" }}>
          {node.unlocked ? iconMap[node.icon] : <Lock size={14} />}
        </span>
      </motion.div>

      {/* Level badge */}
      {node.unlocked && (
        <motion.div className="node-badge" style={{ backgroundColor: color }}
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5, type: "spring" }}>
          {node.level}
        </motion.div>
      )}

      {/* Tooltip */}
      <AnimatePresence>
        {hovered && node.unlocked && (
          <motion.div className="node-tooltip"
            style={{ borderColor: `${color}40` }}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}>
            <div className="tooltip-title">{node.title}</div>
            <div className="tooltip-desc">{node.description}</div>
            <div className="tooltip-xp" style={{ color }}>{node.xp} XP • {node.uses} usos</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Label */}
      <div className="node-label" style={{ color: node.unlocked ? "#b8b8cc" : "#4a4a5c" }}>
        {node.unlocked ? node.title : "???"}
      </div>
    </div>
  );
}

// ─── Constellation Centre (HTML div) ─────────────────────
function ConstellationCenter({ c }: {
  c: Constellation;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="center-wrapper" style={{ left: `${c.cx}%`, top: `${c.cy}%` }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>

      {/* Rotating dashed ring */}
      <motion.div className="center-rotate-ring"
        style={{ borderColor: c.color }}
        animate={{ rotate: 360 }}
        transition={{ duration: 28, repeat: Infinity, ease: "linear" }} />

      {/* Pulse ring */}
      <motion.div className="center-pulse-ring"
        style={{ borderColor: c.color }}
        animate={{ scale: [1, 1.35, 1], opacity: [0.2, 0, 0.2] }}
        transition={{ duration: 2.5, repeat: Infinity }}
        initial={{ scale: 1, opacity: 0.2 }} />

      {/* Body */}
      <motion.div className="center-body"
        style={{
          borderColor: c.color,
          background: "#0c0c16",
          boxShadow: hovered ? `0 0 24px ${c.glowColor}, inset 0 0 8px ${c.glowColor}`
            : `0 0 8px ${c.glowColor}`,
        }}
        animate={{ scale: hovered ? 1.05 : 1 }}
        transition={{ type: "spring", stiffness: 220 }}>
        <span style={{ color: c.color }}>{iconMap[c.icon]}</span>
      </motion.div>

      {/* Title */}
      <div className="center-title" style={{ color: c.color }}>{c.title}</div>
    </div>
  );
}

// ─── Activation Burst ────────────────────────────────────
function ActivationBurst({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <motion.div className="activation-burst" style={{ left: `${x}%`, top: `${y}%` }}
      initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.6 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <motion.div key={i} className="burst-ray" style={{ backgroundColor: color, transform: `rotate(${i * 36}deg)` }}
          initial={{ scaleY: 0, opacity: 1 }} animate={{ scaleY: [0, 1.6, 0], opacity: [1, 0.6, 0] }}
          transition={{ duration: 0.45 }} />
      ))}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  Main App
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [burst, setBurst] = useState<{ x: number; y: number; color: string } | null>(null);

  const handleActivate = useCallback((x: number, y: number, color: string) => {
    setBurst({ x, y, color });
    setTimeout(() => setBurst(null), 600);
  }, []);

  return (
    <div className="app">
      <BackgroundParticles />

      <AnimatePresence>
        {burst && <ActivationBurst x={burst.x} y={burst.y} color={burst.color} />}
      </AnimatePresence>

      {/* Header */}
      <motion.header className="rpg-header"
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="rpg-header-left">
          <motion.div className="rpg-logo"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
            <Sparkles size={18} fill="#00e5ff" />
          </motion.div>
          <div>
            <h1 className="rpg-title">VOX</h1>
            <p className="rpg-subtitle">ÁRVORE DE HABILIDADES</p>
          </div>
        </div>

        <div className="rpg-stats">
          <div className="rpg-stat"><Flame size={12} fill="#ff6d00" /><span>7 dias</span></div>
          <div className="rpg-stat"><TrendingUp size={12} /><span>Nv. {globalLevel}</span></div>
          <div className="rpg-stat"><Zap size={12} fill="#ffd600" /><span>{totalXp} XP</span></div>
          <div className="rpg-avatar"><Award size={14} /></div>
        </div>
      </motion.header>

      {/* XP Bar */}
      <div className="rpg-xp-bar">
        <div className="rpg-xp-label"><Star size={9} fill="#ffd600" /><span>{totalXp} / {nextLevelXp} XP</span></div>
        <div className="rpg-xp-track">
          <motion.div className="rpg-xp-fill"
            initial={{ width: 0 }} animate={{ width: `${((totalXp % 500) / 500) * 100}%` }}
            transition={{ duration: 1, ease: "easeOut" }} />
        </div>
      </div>

      {/* Constellation Map Container */}
      <motion.div className="map-container"
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}>

        {/* SVG lines layer (absolute, behind nodes) */}
        <SVGLines />

        {/* Constellation centres */}
        {constellations.map(c => (
          <ConstellationCenter key={c.id} c={c} />
        ))}

        {/* Skill nodes */}
        {constellations.map(c =>
          c.nodes.map(node => (
            <SkillNode key={node.id} node={node} color={c.color} glowColor={c.glowColor} onActivate={handleActivate} />
          ))
        )}
      </motion.div>

      {/* Legend */}
      <motion.div className="constellation-legend"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
        {constellations.map(c => (
          <div key={c.id} className="legend-item">
            <CircleDot size={9} color={c.color} fill={c.color} />
            <span>{c.title}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

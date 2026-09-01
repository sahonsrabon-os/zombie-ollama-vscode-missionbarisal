#!/usr/bin/env node
// =============================================================================
// Mission Barisal v3 — ACP Skills Integration Module
// Extracted from JetBrains ACP Agent Registry (38 agents)
// =============================================================================
// This module provides:
//   1. Searchable database of 38 ACP agent skills
//   2. Agent invocation helpers (npx/binary)
//   3. ACP registry registration data for our server
// =============================================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SKILLS_DB_PATH = path.resolve(__dirname, 'data', 'acp-skills.json');
const SKILLS_DIR = path.resolve(__dirname, 'skills');
const LEGACY_DUMP = path.join(SKILLS_DIR, '_.md');

// ─── Load skills database (3-source fallback) ─────────────────
// 1. data/acp-skills.json      — canonical JSON database
// 2. skills/_.md               — legacy JSON dump (stripped of "### " prefix)
// 3. skills/*.md               — parse the custom "### id" + "**field**:" format
function loadSkillsDB() {
  // Source 1: canonical JSON
  try {
    if (fs.existsSync(SKILLS_DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(SKILLS_DB_PATH, 'utf8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log('DEBUG: Successfully loaded', parsed.length, 'skills from', SKILLS_DB_PATH);
        return parsed;
      }
    } else {
      console.log('DEBUG: Skills database file not found at', SKILLS_DB_PATH);
    }
  } catch (e) {
    console.log('DEBUG: Error loading skills database:', e.message);
  }

  // Source 2: legacy JSON dump (skills/_.md) — strip leading "### "
  try {
    if (fs.existsSync(LEGACY_DUMP)) {
      let raw = fs.readFileSync(LEGACY_DUMP, 'utf8');
      if (raw.startsWith('### ')) raw = raw.slice(4);
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log('DEBUG: Loaded', parsed.length, 'skills from legacy dump', LEGACY_DUMP);
        return parsed;
      }
    }
  } catch (e) {
    console.log('DEBUG: Legacy dump parse failed:', e.message);
  }

  // Source 3: scan skills/*.md and parse the custom "### id" format
  try {
    if (fs.existsSync(SKILLS_DIR)) {
      const files = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md') && f !== '_.md' && f !== '_instructions.md');
      const fromMd = [];
      for (const file of files) {
        const content = fs.readFileSync(path.join(SKILLS_DIR, file), 'utf8');
        const id = (content.match(/^###\s+(.+)$/m) || [])[1];
        if (!id) continue;
        const field = (k) => {
          const re = new RegExp('^\\*\\*' + k + '\\*\\*\\s*:\\s*(.+)$', 'm');
          const m = content.match(re);
          return m ? m[1].trim() : null;
        };
        const hasNpxRaw = field('hasNpx') || '';
        const npxMatch = hasNpxRaw.match(/true\s*\(`([^`]+)`\)/);
        const tools = (field('tools') || '').split(',').map((t) => t.trim()).filter(Boolean);
        const permissions = (field('permissions') || '').split(',').map((p) => p.trim()).filter(Boolean);
        fromMd.push({
          id,
          name: field('name') || id,
          description: field('description') || '',
          version: field('version') || '1.0.0',
          category: field('category') || 'general',
          hasNpx: !!npxMatch || hasNpxRaw.toLowerCase() === 'true',
          npxCommand: npxMatch ? npxMatch[1] : null,
          hasBinary: (field('hasBinary') || '').toLowerCase() === 'true',
          permissions,
          tools,
          source: file,
        });
      }
      if (fromMd.length > 0) {
        console.log('DEBUG: Parsed', fromMd.length, 'skills from', SKILLS_DIR);
        return fromMd;
      }
    }
  } catch (e) {
    console.log('DEBUG: Skills dir scan failed:', e.message);
  }

  console.log('DEBUG: No skills found from any source — using empty array');
  return [];
}

const skillsDB = loadSkillsDB();

// ─── Categorized access ───────────────────────────────────────
const NPX_AGENTS = skillsDB.filter((s) => s.hasNpx);
const BINARY_AGENTS = skillsDB.filter((s) => s.hasBinary);
const OTHER_AGENTS = skillsDB.filter(
  (s) => !s.hasNpx && !s.hasBinary,
);

// ─── Search skills by keyword ─────────────────────────────────
function searchSkills(query) {
  if (!query || !query.trim()) return skillsDB;
  const q = query.toLowerCase().trim();
  return skillsDB.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q),
  );
}

// ─── Get a specific skill by ID ───────────────────────────────
function getSkill(id) {
  return skillsDB.find((s) => s.id === id) || null;
}

// ─── Get invocation command for a skill ───────────────────────
function getInvokeCommand(skillId) {
  const skill = getSkill(skillId);
  if (!skill) return null;

  // Prefer npx over binary (npx is cross-platform)
  if (skill.hasNpx && skill.npxCommand) {
    return { type: 'npx', command: skill.npxCommand };
  }

  // Binary available (platform-specific)
  if (skill.hasBinary) {
    return {
      type: 'binary',
      platforms: skill.binaryInfo
        ? skill.binaryInfo.split(', ').map((p) => p.trim())
        : [],
      note: 'Pre-built binary — must match system architecture',
    };
  }

  return { type: 'unsupported', note: 'No distribution method available' };
}

// ─── Execute an ACP agent via npx (async wrapper) ─────────────
function invokeNpxAgent(skillId, args) {
  return new Promise((resolve) => {
    const skill = getSkill(skillId);
    if (!skill) {
      resolve({ success: false, error: 'Skill not found: ' + skillId });
      return;
    }

    const cmd = getInvokeCommand(skillId);
    if (!cmd || cmd.type !== 'npx') {
      resolve({
        success: false,
        error:
          'Skill "' +
          skillId +
          '" cannot be invoked via npx. ' +
          (cmd ? cmd.note : 'No distribution available'),
      });
      return;
    }

    try {
      const result = execSync(cmd.command + ' ' + (args || ''), {
        timeout: 30000,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      });
      resolve({ success: true, output: result.slice(0, 50000) });
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
}

// ─── Our server's ACP registration ────────────────────────────
const ACP_REGISTRATION = {
  id: 'mission-barisal',
  name: 'Mission Barisal',
  version: '3.0.0',
  description:
    'ZombieCoder multi-agent AI platform with 9 specialist agents: ' +
    'Code Guru (architecture), Bug Hunter (debugging), Security Hero (security), ' +
    'Performance Wizard (performance), Documentation King (docs), QA Tyrant (quality), ' +
    'Team Heart (general), Customer Experience Specialist, E-Commerce Operations Analyst',
  website: 'https://zombiecoder.my.id/',
  repository: '',
  authors: ['Sahon Srabon — Developer Zone (Dhaka, Bangladesh)'],
  license: 'Proprietary — Local Freedom Protocol',
  icon: '',
  distribution: {
    url: 'http://localhost:${port}/mcp',
    type: 'mcp',
  },
};

// ─── Helpers ──────────────────────────────────────────────────
function getSummary() {
  return {
    total: skillsDB.length,
    npx_agents: NPX_AGENTS.length,
    binary_agents: BINARY_AGENTS.length,
    other_agents: OTHER_AGENTS.length,
    top_agents: skillsDB.slice(0, 5).map((s) => ({
      id: s.id,
      name: s.name,
      version: s.version,
    })),
  };
}

module.exports = {
  skillsDB,
  NPX_AGENTS,
  BINARY_AGENTS,
  OTHER_AGENTS,
  searchSkills,
  getSkill,
  getInvokeCommand,
  invokeNpxAgent,
  ACP_REGISTRATION,
  getSummary,
  totalSkills: skillsDB.length,
};

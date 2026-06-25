import type { BubbleState } from './bubbles';
import type { ThinkingStage } from './App';

export interface InsightItem {
  id: string;
  source: string;
  color: string;
  points: string[];
  category: string;
  score: number;
  signal: 'expand' | 'keep';
  dropped: number;
}

export interface RepresentativeCase {
  id: string;
  source: string;
  color: string;
  text: string;
  signal: 'expand' | 'keep';
  status: 'candidate' | 'confirmed';
  rationale: string;
}

const SIGNAL_PATTERNS = [
  /核心|关键|本质|前提|假设|风险|机会|瓶颈|突破/u,
  /应该|必须|需要|不要|不能|意味着|决定了/u,
  /研究|系统|模型|架构|评估|验证|泛化|现实/u,
];

const EXPAND_PATTERNS = [
  /case|案例|例如|比如|为例|实验|baseline|ablation|失败|翻车|证据|反例/iu,
  /tradeoff|取舍|权衡|决定了|真正的问题|更关键的是/iu,
  /如果.*会|一旦.*就|最可能.*失败|风险在于/iu,
];

const DROP_PATTERNS = [
  /首先|其次|最后|总体来说|从某种意义上|值得注意的是/u,
  /这是一个很有意思的问题|我认为这是一个非常重要的问题/u,
];

export function extractInsights(
  bubbles: BubbleState[],
  stage: ThinkingStage | null = null,
): InsightItem[] {
  const grouped = new Map<string, InsightItem>();
  const seen = new Set<string>();

  for (const bubble of bubbles) {
    if (bubble.kind !== 'mentor' && bubble.kind !== 'report') {
      continue;
    }

    const source = bubble.kind === 'mentor' ? bubble.name : 'Deep Review';
    const color = bubble.kind === 'mentor' ? bubble.color : '#7c3aed';

    for (const sentence of splitInsightCandidates(bubble.text)) {
      const normalized = normalizeSentence(sentence);
      if (!normalized || seen.has(normalized)) continue;
      const score = scoreInsight(sentence, bubble.kind);
      const signal = classifySignal(sentence, score);
      if (signal === 'drop') {
        const existing = grouped.get(source);
        if (existing) existing.dropped += 1;
        continue;
      }
      const category = classifyInsight(sentence, stage, signal);
      if (score < 3) continue;

      seen.add(normalized);
      const existing = grouped.get(source);
      if (!existing) {
        grouped.set(source, {
          id: `${source}_${normalized}`,
          source,
          color,
          points: [sentence.trim()],
          category,
          score,
          signal,
          dropped: 0,
        });
        continue;
      }

      if (signal === 'expand' && existing.signal !== 'expand') {
        existing.points = [sentence.trim()];
        existing.signal = 'expand';
      }
      if (existing.points.length < (signal === 'expand' ? 2 : 1)) {
        existing.points.push(sentence.trim());
      }
      if (score >= existing.score) {
        existing.category = category;
      }
      existing.score += score;
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => (
      Number(b.signal === 'expand') - Number(a.signal === 'expand')
      || b.score - a.score
      || a.source.localeCompare(b.source)
    ))
    .slice(0, 6);
}

export function extractRepresentativeCase(bubbles: BubbleState[]): RepresentativeCase | null {
  const candidates = extractCaseCandidates(bubbles).filter((candidate) => candidate.status === 'confirmed');

  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => {
    const scoreDiff = Number(b.signal === 'expand') - Number(a.signal === 'expand');
    if (scoreDiff !== 0) return scoreDiff;
    return b.text.length - a.text.length;
  })[0];
}

export function extractCaseCandidates(bubbles: BubbleState[]): RepresentativeCase[] {
  const candidates: RepresentativeCase[] = [];
  const seen = new Set<string>();

  for (const bubble of bubbles) {
    if (bubble.kind !== 'mentor' && bubble.kind !== 'report') continue;

    const source = bubble.kind === 'mentor' ? bubble.name : 'Deep Review';
    const color = bubble.kind === 'mentor' ? bubble.color : '#7c3aed';

    for (const sentence of splitInsightCandidates(bubble.text)) {
      if (!looksLikeCase(sentence)) continue;
      const id = `${source}_${normalizeSentence(sentence)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const score = scoreCase(sentence, bubble.kind);
      const status = classifyCaseStatus(sentence, score);
      candidates.push({
        id,
        source,
        color,
        text: sentence.trim(),
        signal: score >= 7 ? 'expand' : 'keep',
        status,
        rationale: caseRationale(sentence, status),
      });
    }
  }

  return candidates.sort((a, b) => {
    const scoreDiff = Number(b.signal === 'expand') - Number(a.signal === 'expand');
    if (scoreDiff !== 0) return scoreDiff;
    return b.text.length - a.text.length;
  });
}

export function extractCaseFromText(
  text: string,
  source = 'Case',
  color = '#c2410c',
  kind: BubbleState['kind'] = 'mentor',
): RepresentativeCase | null {
  const candidates = splitInsightCandidates(text)
    .filter((sentence) => looksLikeCase(sentence))
    .map((sentence) => {
      const score = scoreCase(sentence, kind);
      const status = classifyCaseStatus(sentence, score);
      return {
        id: `${source}_${normalizeSentence(sentence)}`,
        source,
        color,
        text: sentence.trim(),
        signal: score >= 7 ? 'expand' as const : 'keep' as const,
        status,
        rationale: caseRationale(sentence, status),
        score,
      };
    })
    .sort((a, b) => Number(b.signal === 'expand') - Number(a.signal === 'expand') || b.score - a.score);

  if (candidates.length === 0) return null;

  const top = candidates[0];
  return {
    id: top.id,
    source: top.source,
    color: top.color,
    text: top.text,
    signal: top.signal,
    status: top.status,
    rationale: top.rationale,
  };
}

function splitInsightCandidates(text: string): string[] {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s.*$/gm, ' ')
    .replace(/^\|.*$/gm, ' ')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];

  return cleaned
    .split(/(?<=[。！？!?;；.])\s+|(?<=[。！？!?;；.])|(?<=:)\s+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 16 && part.length <= 140);
}

function scoreInsight(sentence: string, kind: BubbleState['kind']): number {
  let score = 0;

  if (kind === 'synthesis' || kind === 'report') score += 2;
  if (sentence.length >= 24 && sentence.length <= 90) score += 1;
  if (sentence.includes('：') || sentence.includes(':')) score += 1;
  if (/case|案例|例如|比如|为例|实验|baseline|ablation|失败|反例|证据/iu.test(sentence)) score += 2;
  if (/tradeoff|取舍|权衡|判断|风险|代价|瓶颈/iu.test(sentence)) score += 1;

  for (const pattern of SIGNAL_PATTERNS) {
    if (pattern.test(sentence)) score += 1;
  }

  return score;
}

function scoreCase(sentence: string, kind: BubbleState['kind']): number {
  let score = scoreInsight(sentence, kind);
  if (/为例|案例|例如|比如|失败|反例|baseline|ablation|experiment|实验/iu.test(sentence)) score += 2;
  if (/为什么|因此|说明|决定了|导致|问题在于/iu.test(sentence)) score += 1;
  return score;
}

function classifyCaseStatus(sentence: string, score: number): 'candidate' | 'confirmed' {
  const explicitCaseMarker = /具体\s*case|case\s*[：:]|案例\s*[：:]|具体\s*案例/iu.test(sentence);
  const hasObject = /为例|案例|反例|先例|在.*中|当时|某次|ImageNet|Word2Vec|Transformer|benchmark|系统|实验/iu.test(sentence);
  const hasAction = /研究|测试|设计|做了|观察|训练|比较|验证|可视化|扰动|ablation|baseline|experiment|实验/iu.test(sentence);
  const hasOutcome = /说明|发现|看到|暴露|导致|证明|表明|学会了|失败|成功|迁移|留下来|高估|断裂/iu.test(sentence);
  const hasLesson = /因此|所以|意味着|决定了|问题在于|最关键的是/iu.test(sentence);

  if (explicitCaseMarker) {
    return 'confirmed';
  }

  if (hasObject && hasAction && (hasOutcome || hasLesson) && score >= 7) {
    return 'confirmed';
  }
  return 'candidate';
}

function classifySignal(sentence: string, score: number): 'expand' | 'keep' | 'drop' {
  if (DROP_PATTERNS.some((pattern) => pattern.test(sentence))) return 'drop';
  if (score >= 6 || EXPAND_PATTERNS.some((pattern) => pattern.test(sentence))) return 'expand';
  if (score >= 3) return 'keep';
  return 'drop';
}

function looksLikeCase(sentence: string): boolean {
  return /具体\s*case|case\s*[：:]|案例\s*[：:]|具体\s*案例|为例|案例|例如|比如|失败|反例|baseline|ablation|experiment|实验|先例/iu.test(sentence);
}

function caseRationale(sentence: string, status: 'candidate' | 'confirmed'): string {
  if (status === 'candidate') {
    return '这段话提到了例子，但案例结构还不完整，更适合作为候选线索而不是直接操作对象。';
  }
  if (/失败|反例|翻车/u.test(sentence)) return '这个 case 值得展开，因为它直接暴露了失败边界。';
  if (/baseline|ablation|experiment|实验/iu.test(sentence)) return '这个 case 值得展开，因为它连着可验证的研究动作。';
  return '这个 case 值得展开，因为它比抽象判断更能解释问题。';
}

function normalizeSentence(sentence: string): string {
  return sentence.replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
}

function classifyInsight(sentence: string, stage: ThinkingStage | null, signal: 'expand' | 'keep'): string {
  const text = sentence.toLowerCase();
  const prefix = signal === 'expand' ? 'Expand' : 'Keep';

  if (stage === 'explore') {
    if (/假设|前提|误区|盲点/u.test(sentence)) return `${prefix}: Hidden Assumptions`;
    if (/方向|机会|值得|切口|可以从/u.test(sentence)) return `${prefix}: Promising Directions`;
    return `${prefix}: New Angles`;
  }

  if (stage === 'clarify') {
    if (/标准|判断|优先|更在意|取舍/u.test(sentence)) return `${prefix}: Decision Criteria`;
    if (/冲突|代价|tradeoff|权衡/u.test(text) || /权衡|取舍/u.test(sentence)) return `${prefix}: Tradeoffs`;
    return `${prefix}: Open Questions`;
  }

  if (stage === 'decide') {
    if (/风险|失败|错在|不成立/u.test(sentence)) return `${prefix}: Major Risks`;
    if (/证据|验证|还不能|尚未/u.test(sentence)) return `${prefix}: Missing Evidence`;
    return `${prefix}: Strong Claims`;
  }

  if (stage === 'plan') {
    if (/验证|评估|指标|baseline|ablation/u.test(text) || /验证|评估|指标/u.test(sentence)) return `${prefix}: Validation Strategy`;
    if (/风险|阻塞|依赖|成本/u.test(sentence)) return `${prefix}: Execution Risks`;
    return `${prefix}: Next Experiments`;
  }

  if (/风险|失败|错在/u.test(sentence)) return `${prefix}: Risks`;
  if (/方向|机会|切口/u.test(sentence)) return `${prefix}: Directions`;
  return `${prefix}: Highlights`;
}

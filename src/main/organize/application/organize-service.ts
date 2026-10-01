import type { NoteDetail, NoteSummary, RelocateNoteResult, VaultTree } from '../../../shared/ipc/notes';
import type {
  ImportNoteResult,
  OrganizeApplyResult,
  OrganizePlan,
  PlaceNoteResult,
  PlannedNote,
} from '../../../shared/ipc/organize';
import type { ActiveModel } from '../../ai-provider/application/active-llm';
import { numberedName } from '../../note/domain/names';
import { DomainError } from '../../platform/errors';
import { bestClustering, MIN_NOTES, MIN_SILHOUETTE } from '../domain/clustering';
import { closerNewGroup, fittingFolder } from '../domain/placement';
import { subMatrix, titleSimilarity } from '../domain/similarity';
import { nameFolders, UNSORTED } from './folder-namer';

const NAMING_TIMEOUT_MS = 60_000;

/** note 도메인 공개 API 중 organize가 쓰는 부분 (VaultNoteService가 만족한다). */
export interface OrganizeNotePort {
  tree(): VaultTree;
  move(input: { id: string; folder: string }): RelocateNoteResult;
  rename(input: { id: string; title: string }): RelocateNoteResult;
  importFile(input: { sourcePath: string; folder: string }): NoteDetail;
}

/** note 도메인 공개 API 중 organize가 쓰는 부분 (FolderService가 만족한다). */
export interface OrganizeFolderPort {
  create(input: { parent?: string; name: string }): { path: string };
}

export interface OrganizeDeps {
  /** 열린 보관함의 노트 — 보관함이 바뀔 수 있어 매번 가져온다 */
  notes(): OrganizeNotePort;
  folders(): OrganizeFolderPort;
  activeLLM: { resolve(): ActiveModel };
  /** 기본 MIN_SILHOUETTE */
  minSilhouette?: number;
}

const join = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
const nameOf = (folder: string) => folder.split('/').pop() ?? '';
const parentOf = (folder: string) => folder.split('/').slice(0, -1).join('/');
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const isUnder = (path: string, folder: string) => same(path, folder) || path.toLowerCase().startsWith(`${folder.toLowerCase()}/`);
/** 폴더 바로 아래 하위 폴더 (「미분류」 제외) */
const childFolders = (tree: VaultTree, folder: string) =>
  tree.folders.filter((f) => same(parentOf(f), folder) && nameOf(f) !== UNSORTED);
/** 폴더(하위 포함) 안의 노트 */
const notesUnder = (tree: VaultTree, folder: string, exceptId?: string) =>
  tree.notes.filter((n) => n.id !== exceptId && isUnder(n.folder, folder));
const planned = (note: NoteSummary): PlannedNote => ({ id: note.id, title: note.title, from: note.folder });

/** 노트 제목으로 폴더를 나누고 새 노트를 맞는 폴더에 넣는다 (소웨공/Phase1_파일분류_계획서.md). */
export class OrganizeService {
  constructor(private readonly deps: OrganizeDeps) {}

  /** 분류하기 1단계: 옮길 계획만 만든다. 아무것도 옮기지 않는다. */
  async preview(folder: string): Promise<OrganizePlan> {
    const tree = this.deps.notes().tree();
    if (folder !== '' && !tree.folders.some((f) => same(f, folder))) {
      throw new DomainError('FOLDER_NOT_FOUND', `Folder ${folder} not found`);
    }
    if (nameOf(folder) === UNSORTED) throw new DomainError('VALIDATION_FAILED', 'The unsorted folder is not classified');

    const unsorted = join(folder, UNSORTED);
    const candidates = tree.notes.filter((n) => same(n.folder, folder) || same(n.folder, unsorted));
    const subfolders = childFolders(tree, folder);
    const members = subfolders.map((path) => notesUnder(tree, path));
    const everyone = [...candidates, ...members.flat()];
    const sim = titleSimilarity(everyone.map((n) => n.title));
    const indexOf = new Map(everyone.map((n, i) => [n.id, i]));
    const at = (note: NoteSummary) => indexOf.get(note.id)!;
    const shapes = subfolders.map((path, i) => ({ path, members: members[i]!.map(at) }));

    // 1. 이미 있는 하위 폴더에 맞는 노트는 그 폴더로
    const moves: OrganizePlan['moves'] = [];
    const remaining: NoteSummary[] = [];
    for (const note of candidates) {
      const fit = fittingFolder(sim, at(note), shapes);
      if (fit) moves.push({ ...planned(note), to: fit });
      else remaining.push(note);
    }

    // 2. 남은 노트끼리 묶는다. 2개 이상인 묶음만 새 폴더가 된다
    const clustering = bestClustering(subMatrix(sim, remaining.map(at)), {
      minScore: this.deps.minSilhouette ?? MIN_SILHOUETTE,
    });
    const groups: NoteSummary[][] = [];
    const leftovers: NoteSummary[] = [];
    if (clustering) {
      const byLabel = new Map<number, NoteSummary[]>();
      remaining.forEach((note, i) => {
        const label = clustering.labels[i]!;
        byLabel.set(label, [...(byLabel.get(label) ?? []), note]);
      });
      for (const group of byLabel.values()) {
        if (group.length >= 2) groups.push(group);
        else leftovers.push(...group);
      }
    } else {
      leftovers.push(...remaining);
    }

    // 3. 형제 폴더에 바로 있는 노트 중 자기 폴더보다 새 묶음 대표 위치에 더 가까운 노트는 새 묶음으로
    const groupIndexes = groups.map((group) => group.map(at));
    for (const shape of shapes) {
      for (const note of tree.notes.filter((n) => same(n.folder, shape.path))) {
        const target = closerNewGroup(sim, at(note), shape.members, groupIndexes);
        if (target !== null) groups[target]!.push(note);
      }
    }

    // 4. 어디에도 못 간 노트: 하위 폴더가 있거나 생기면 「미분류」로, 아니면 그대로
    if (subfolders.length > 0 || groups.length > 0) {
      for (const note of leftovers) if (!same(note.folder, unsorted)) moves.push({ ...planned(note), to: unsorted });
    }

    // 5. 새 폴더 이름 — 분류하기 한 번에 AI 한 번
    const names = groups.length === 0 ? [] : await this.nameGroups(folder, groups);
    const nothing = groups.length === 0 && moves.length === 0;
    return {
      folder,
      newFolders: groups.map((group, i) => ({ name: names[i]!, notes: group.map(planned) })),
      moves,
      skipped: nothing ? (remaining.length < MIN_NOTES ? 'TOO_FEW_NOTES' : 'NO_CLEAR_GROUPS') : null,
    };
  }

  /** 분류하기 2단계: 미리보기대로 옮긴다. 그사이 사라진 노트는 건너뛴다. */
  apply(plan: OrganizePlan): OrganizeApplyResult {
    const createdFolders: string[] = [];
    const updatedNoteIds = new Set<string>();
    let movedNotes = 0;
    const moveInto = (id: string, folder: string) => {
      const result = this.moveNumbered(id, folder);
      if (!result) return;
      movedNotes += 1;
      for (const updated of result.updatedNoteIds) updatedNoteIds.add(updated);
    };
    for (const group of plan.newFolders) {
      const path = this.ensureFolder(plan.folder, group.name, createdFolders);
      for (const note of group.notes) moveInto(note.id, path);
    }
    for (const move of plan.moves) moveInto(move.id, this.ensureFolder(parentOf(move.to), nameOf(move.to), createdFolders));
    return { movedNotes, createdFolders, updatedNoteIds: [...updatedNoteIds] };
  }

  /** 새 노트 자동 배치: 지금 폴더를 맨 위로 보고 한 층씩 내려간다. 맞는 하위 폴더가 없으면 그 층의 「미분류」. */
  place(noteId: string): PlaceNoteResult {
    const tree = this.deps.notes().tree();
    const note = tree.notes.find((n) => n.id === noteId);
    if (!note) throw new DomainError('NOTE_NOT_FOUND', `Note ${noteId} not found`);
    let level = nameOf(note.folder) === UNSORTED ? parentOf(note.folder) : note.folder;
    for (;;) {
      const subfolders = childFolders(tree, level);
      if (subfolders.length === 0) break;
      const members = subfolders.map((path) => notesUnder(tree, path, noteId));
      const sim = titleSimilarity([note.title, ...members.flat().map((n) => n.title)]);
      let offset = 1; // 0번은 새 노트
      const shapes = subfolders.map((path, i) => {
        const indexes = members[i]!.map((_, j) => offset + j);
        offset += indexes.length;
        return { path, members: indexes };
      });
      const fit = fittingFolder(sim, 0, shapes);
      if (!fit) {
        level = join(level, UNSORTED);
        break;
      }
      level = fit;
    }
    if (same(level, note.folder)) return { folder: note.folder, updatedNoteIds: [] };
    if (level !== '') this.ensureFolder(parentOf(level), nameOf(level));
    const moved = this.moveNumbered(noteId, level);
    return { folder: moved?.note.folder ?? note.folder, updatedNoteIds: moved?.updatedNoteIds ?? [] };
  }

  /** 끌어다 놓은 바깥 `.md`: 놓은 폴더로 가져온 뒤 그 폴더부터 자동 배치 */
  importFile(input: { sourcePath: string; folder: string }): ImportNoteResult {
    const note = this.deps.notes().importFile(input);
    const placed = this.place(note.id);
    return { noteId: note.id, folder: placed.folder, updatedNoteIds: placed.updatedNoteIds };
  }

  private async nameGroups(folder: string, groups: NoteSummary[][]): Promise<string[]> {
    const active = this.deps.activeLLM.resolve(); // 설정이 없으면 AI_PROVIDER_NOT_CONFIGURED
    if (!active.capabilities.supportsAll(['structuredOutput'])) {
      throw new DomainError('AI_CAPABILITY_UNSUPPORTED', `${active.model} cannot return structured output`);
    }
    return nameFolders(
      active.client,
      { parentPath: folder, groups: groups.map((group) => group.map((n) => n.title)) },
      AbortSignal.timeout(NAMING_TIMEOUT_MS),
    );
  }

  /** 있으면 그 폴더, 없으면 만든다 (AI가 지은 이름이 이미 있는 폴더와 같으면 합친다). */
  private ensureFolder(parent: string, name: string, created?: string[]): string {
    const path = join(parent, name);
    const existing = this.deps.notes().tree().folders.find((f) => same(f, path));
    if (existing) return existing;
    const made = this.deps.folders().create(parent ? { parent, name } : { name }).path;
    created?.push(made);
    return made;
  }

  /** 옮길 폴더에 같은 제목이 있으면 `제목 (2)`로 바꾼 뒤 옮긴다. 노트가 없어졌으면 null. */
  private moveNumbered(id: string, folder: string): RelocateNoteResult | null {
    const notes = this.deps.notes();
    try {
      return notes.move({ id, folder });
    } catch (error) {
      if (error instanceof DomainError && error.code === 'NOTE_NOT_FOUND') return null;
      if (!(error instanceof DomainError && error.code === 'NOTE_TITLE_TAKEN')) throw error;
    }
    const tree = notes.tree();
    const current = tree.notes.find((n) => n.id === id);
    if (!current) return null;
    const taken = new Set(
      tree.notes.filter((n) => same(n.folder, folder) || same(n.folder, current.folder)).map((n) => n.title),
    );
    const renamed = notes.rename({ id, title: numberedName(current.title, taken) });
    const moved = notes.move({ id, folder });
    return { note: moved.note, updatedNoteIds: [...new Set([...renamed.updatedNoteIds, ...moved.updatedNoteIds])] };
  }
}

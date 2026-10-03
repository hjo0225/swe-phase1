import type { NoteDetail, NoteSummary, RelocateNoteResult, VaultTree } from '../../../shared/ipc/notes';
import type {
  ImportNoteResult,
  OrganizeApplyResult,
  OrganizePlan,
  PlaceNoteResult,
  PlannedNote,
} from '../../../shared/ipc/organize';
import type { ActiveModel } from '../../ai-provider/application/active-llm';
import { ProviderError } from '../../ai-provider/application/ports';
import { numberedName } from '../../note/domain/names';
import { DomainError } from '../../platform/errors';
import { bestClustering, MIN_NOTES, MIN_SILHOUETTE } from '../domain/clustering';
import { closerNewGroup, fittingFolder, folderRadius } from '../domain/placement';
import { cosineSimilarity, subMatrix } from '../domain/similarity';
import { OrganizeLock } from './organize-lock';
import { isUnsortedFolder, UNSORTED_FOLDER } from '../../../shared/notes/default-names';
import { planFolders } from './folder-planner';

const NAMING_TIMEOUT_MS = 60_000;
const EMBEDDING_TIMEOUT_MS = 60_000;

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
  /** 분류하는 동안 보관함 구조 변경을 막는 잠금 (note IPC와 함께 쓴다). 기본은 이 서비스만의 잠금 */
  lock?: OrganizeLock;
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
/** path가 folder이거나 그 안(하위 포함)인지. 맨 위('')는 모든 폴더를 품는다. */
const isUnder = (path: string, folder: string) =>
  folder === '' || same(path, folder) || path.toLowerCase().startsWith(`${folder.toLowerCase()}/`);
/** 폴더 바로 아래 하위 폴더 («남는 노트» 폴더 제외) */
const childFolders = (tree: VaultTree, folder: string) =>
  tree.folders.filter((f) => same(parentOf(f), folder) && !isUnsortedFolder(nameOf(f)));
/** 그 층의 «남는 노트» 폴더 경로. 예전 버전이 만든 «미분류»가 있으면 그것을 계속 쓴다. */
const unsortedIn = (tree: VaultTree, folder: string) =>
  tree.folders.find((f) => same(parentOf(f), folder) && isUnsortedFolder(nameOf(f))) ?? join(folder, UNSORTED_FOLDER);
/** 폴더(하위 포함) 안의 노트 */
const notesUnder = (tree: VaultTree, folder: string, exceptId?: string) =>
  tree.notes.filter((n) => n.id !== exceptId && isUnder(n.folder, folder));
const planned = (note: NoteSummary): PlannedNote => ({ id: note.id, title: note.title, from: note.folder });

/** 노트 제목으로 폴더를 나누고 새 노트를 맞는 폴더에 넣는다 (소웨공/Phase1_파일분류_계획서.md). */
export class OrganizeService {
  private readonly lock: OrganizeLock;

  constructor(private readonly deps: OrganizeDeps) {
    this.lock = deps.lock ?? new OrganizeLock();
  }

  /** 분류하기 1단계: 옮길 계획만 만든다. 아무것도 옮기지 않는다. */
  preview(folder: string): Promise<OrganizePlan> {
    return this.lock.run(() => this.planPreview(folder));
  }

  private async planPreview(folder: string): Promise<OrganizePlan> {
    const tree = this.deps.notes().tree();
    if (folder !== '' && !tree.folders.some((f) => same(f, folder))) {
      throw new DomainError('FOLDER_NOT_FOUND', `Folder ${folder} not found`);
    }
    if (isUnsortedFolder(nameOf(folder))) throw new DomainError('VALIDATION_FAILED', 'The unsorted folder is not classified');

    const unsorted = unsortedIn(tree, folder);
    const candidates = tree.notes.filter((n) => same(n.folder, folder) || same(n.folder, unsorted));
    const subfolders = childFolders(tree, folder);
    const members = subfolders.map((path) => notesUnder(tree, path));
    // 견줄 하위 폴더도 없고 묶을 노트도 3개가 안 되면 AI를 부를 필요가 없다
    const nothingToCompare = subfolders.length === 0 ? candidates.length < MIN_NOTES : candidates.length === 0;
    if (nothingToCompare) {
      return { folder, newFolders: [], moves: [], skipped: candidates.length < MIN_NOTES ? 'TOO_FEW_NOTES' : 'NO_CLEAR_GROUPS' };
    }
    const everyone = [...candidates, ...members.flat()];
    const sim = cosineSimilarity(await this.embedTitles(everyone.map((n) => n.title)));
    const indexOf = new Map(everyone.map((n, i) => [n.id, i]));
    const at = (note: NoteSummary) => indexOf.get(note.id)!;
    const shapes = subfolders.map((path, i) => {
      const indexes = members[i]!.map(at);
      return { path, members: indexes, radius: folderRadius(sim, indexes) }; // 후보마다 다시 구하지 않게 한 번만
    });

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

    // 5. 위로 합치기와 이름 — 묶음마다 폴더 경로를 gpt가 정한다 (분류하기 한 번에 AI 한 번). 같은 경로는 한 폴더로 합친다.
    const paths = groups.length === 0 ? [] : await this.planGroups(folder, groups);
    const byPath = new Map<string, { path: string[]; notes: PlannedNote[] }>();
    groups.forEach((group, i) => {
      const path = paths[i]!;
      const key = path.join('/').toLowerCase();
      const entry = byPath.get(key) ?? { path, notes: [] };
      entry.notes.push(...group.map(planned));
      byPath.set(key, entry);
    });
    const nothing = groups.length === 0 && moves.length === 0;
    return {
      folder,
      newFolders: [...byPath.values()],
      moves,
      skipped: nothing ? (remaining.length < MIN_NOTES ? 'TOO_FEW_NOTES' : 'NO_CLEAR_GROUPS') : null,
    };
  }

  /**
   * 분류하기 2단계: 미리보기대로 옮긴다. 그사이 사라진 노트는 건너뛴다.
   * 노트 하나(또는 폴더 하나)가 실패해도 멈추지 않는다 — 이미 옮긴 노트와 고친 링크를 화면이 알아야 하기 때문이다.
   */
  apply(plan: OrganizePlan): OrganizeApplyResult {
    // 동기로 끝까지 돌아 그사이 다른 요청이 끼어들 수 없다 — 다른 분류 작업이 돌고 있는지만 본다.
    this.lock.assertIdle();
    const createdFolders: string[] = [];
    const updatedNoteIds = new Set<string>();
    const failed: OrganizeApplyResult['failed'] = [];
    let movedNotes = 0;
    const moveInto = (note: PlannedNote, folder: () => string) => {
      try {
        const result = this.moveNumbered(note.id, folder());
        if (!result) return;
        movedNotes += 1;
        for (const updated of result.updatedNoteIds) updatedNoteIds.add(updated);
      } catch {
        failed.push({ id: note.id, title: note.title });
      }
    };
    for (const group of plan.newFolders) {
      let path: string | null = null;
      // 경로의 폴더를 위층부터 하나씩 만든다 (이미 있으면 그대로 쓴다)
      const folder = () => (path ??= group.path.reduce((parent, name) => this.ensureFolder(parent, name, createdFolders), plan.folder));
      for (const note of group.notes) moveInto(note, folder);
    }
    for (const move of plan.moves) moveInto(move, () => this.ensureFolder(parentOf(move.to), nameOf(move.to), createdFolders));
    return { movedNotes, createdFolders, updatedNoteIds: [...updatedNoteIds], failed };
  }

  /** 새 노트 자동 배치: 지금 폴더를 맨 위로 보고 한 층씩 내려간다. 맞는 하위 폴더가 없으면 그 층의 「미분류」. */
  place(noteId: string): Promise<PlaceNoteResult> {
    return this.lock.run(() => this.placeNote(noteId));
  }

  private async placeNote(noteId: string): Promise<PlaceNoteResult> {
    const tree = this.deps.notes().tree();
    const note = tree.notes.find((n) => n.id === noteId);
    if (!note) throw new DomainError('NOTE_NOT_FOUND', `Note ${noteId} not found`);
    let level = isUnsortedFolder(nameOf(note.folder)) ? parentOf(note.folder) : note.folder;
    if (childFolders(tree, level).length === 0) return { folder: note.folder, updatedNoteIds: [] }; // 견줄 폴더가 없으면 AI도 부르지 않는다

    // 내려가며 견줄 노트 전부를 한 번에 임베딩한다 (층마다 부르지 않게)
    const below = notesUnder(tree, level, noteId).filter((n) => !same(n.folder, level));
    const vectors = await this.embedTitles([note.title, ...below.map((n) => n.title)]);
    const vectorOf = new Map(below.map((n, i) => [n.id, vectors[i + 1]!]));
    for (;;) {
      const subfolders = childFolders(tree, level);
      if (subfolders.length === 0) break;
      const members = subfolders.map((path) => notesUnder(tree, path, noteId));
      const sim = cosineSimilarity([vectors[0]!, ...members.flat().map((n) => vectorOf.get(n.id)!)]);
      let offset = 1; // 0번은 새 노트
      const shapes = subfolders.map((path, i) => {
        const indexes = members[i]!.map((_, j) => offset + j);
        offset += indexes.length;
        return { path, members: indexes };
      });
      const fit = fittingFolder(sim, 0, shapes);
      if (!fit) {
        level = unsortedIn(tree, level);
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
  importFile(input: { sourcePath: string; folder: string }): Promise<ImportNoteResult> {
    return this.lock.run(async () => {
      const note = this.deps.notes().importFile(input);
      const placed = await this.placeNote(note.id);
      return { noteId: note.id, folder: placed.folder, updatedNoteIds: placed.updatedNoteIds };
    });
  }

  /** 제목들을 «사용 중» AI로 임베딩한다. 설정이 없으면 AI_PROVIDER_NOT_CONFIGURED, 임베딩을 못 하는 공급자면 AI_CAPABILITY_UNSUPPORTED. */
  private async embedTitles(titles: string[]): Promise<number[][]> {
    const active = this.deps.activeLLM.resolve();
    let vectors: number[][];
    try {
      vectors = await active.client.embed({ inputs: titles, signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS) });
    } catch (error) {
      if (error instanceof ProviderError && error.kind === 'UNSUPPORTED') {
        throw new DomainError('AI_CAPABILITY_UNSUPPORTED', `${active.provider} cannot embed note titles`);
      }
      // Provider 오류 메시지에는 요청 내용이 섞일 수 있어 그대로 내보내지 않는다.
      throw new DomainError('ORGANIZE_EMBEDDING_FAILED', 'Could not read note titles with the AI');
    }
    if (vectors.length !== titles.length) throw new DomainError('ORGANIZE_EMBEDDING_FAILED', 'The AI returned a wrong number of embeddings');
    return vectors;
  }

  private async planGroups(folder: string, groups: NoteSummary[][]): Promise<string[][]> {
    const active = this.deps.activeLLM.resolve(); // 설정이 없으면 AI_PROVIDER_NOT_CONFIGURED
    if (!active.capabilities.supportsAll(['structuredOutput'])) {
      throw new DomainError('AI_CAPABILITY_UNSUPPORTED', `${active.model} cannot return structured output`);
    }
    return planFolders(
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

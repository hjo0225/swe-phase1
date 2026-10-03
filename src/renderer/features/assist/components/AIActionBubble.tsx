import { useQueryClient } from '@tanstack/react-query';
import type { Editor } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/react/menus';
import { Lock, ListTree, Sparkles, Workflow, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import { missingCapabilities, type JobType } from '../../../../shared/assist/capabilities';
import { useActiveCapabilities } from '../../ai-settings/api/settings-queries';
import { PENDING_MARK } from '../editor/ai-pending';
import { JOB_TYPE_LABEL } from '../model/messages';
import { requestJob } from '../model/request-job';
import styles from './AIActionBubble.module.css';

const ACTIONS: { type: JobType; Icon: LucideIcon }[] = [
  { type: 'EXPAND', Icon: Sparkles },
  { type: 'ORGANIZE', Icon: ListTree },
  { type: 'VISUALIZE', Icon: Workflow },
];

const CAPABILITY_HINT = { webSearch: '웹 검색', structuredOutput: '구조화 출력', generate: '텍스트 생성' } as const;

/** 텍스트를 선택하면 뜨는 [구체화] [정리] [시각화]. 누르면 즉시 닫히고 선택 범위가 Pulse로 바뀐다. */
export function AIActionBubble({ editor, noteId }: { editor: Editor; noteId: string }) {
  const capabilities = useActiveCapabilities();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return (
    <BubbleMenu
      editor={editor}
      // 이미 처리 중인 범위를 다시 선택하면 띄우지 않는다.
      shouldShow={({ state }) => {
        const { from, to, empty } = state.selection;
        return !empty && !state.doc.rangeHasMark(from, to, state.schema.marks[PENDING_MARK]!);
      }}
    >
      <div role="toolbar" aria-label="AI 작업" className={`floating-chip ${styles.bubble}`}>
        {ACTIONS.map(({ type, Icon }) => {
          const missing = capabilities ? missingCapabilities(type, capabilities) : [];
          const disabled = !capabilities || missing.length > 0;
          const title = !capabilities
            ? 'AI 설정이 필요합니다'
            : missing.length > 0
              ? `현재 모델은 ${missing.map((c) => CAPABILITY_HINT[c]).join(', ')}을 지원하지 않습니다`
              : undefined;
          return (
            <button
              key={type}
              type="button"
              className={styles.action}
              disabled={disabled}
              title={title}
              onMouseDown={(event) => event.preventDefault()} // 편집기 선택 유지
              onClick={() =>
                void requestJob(editor, { noteId, type }, { queryClient, openSettings: () => void navigate({ search: '?settings' }) })
              }
            >
              {capabilities && missing.length > 0 ? (
                <Lock size={14} strokeWidth={1.75} aria-hidden />
              ) : (
                <Icon size={14} strokeWidth={1.75} aria-hidden />
              )}
              {JOB_TYPE_LABEL[type]}
            </button>
          );
        })}
        {capabilities === null && <span className={styles.hint}>AI 설정 필요</span>}
      </div>
    </BubbleMenu>
  );
}

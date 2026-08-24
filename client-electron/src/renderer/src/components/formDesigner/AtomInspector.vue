<!--
  原子检查器（右侧）
  - 编辑选中原子的属性：name / label / placeholder / help / required
  - 数字类：min / max
  - select：选项编辑
  - 默认值：通过 AtomInput 渲染
  - 联动规则：通过 RuleEditor 编辑
-->
<template>
  <div class="inspector">
    <div class="title">属性</div>

    <Field label="类型">
      <input :value="atom.type" disabled class="ctrl" />
    </Field>

    <Field label="字段名 (name)">
      <input
        :value="atom.name"
        class="ctrl"
        @input="(e) => update({ name: (e.target as HTMLInputElement).value.replace(/\s+/g, '_') })"
      />
    </Field>

    <Field label="显示名 (label)">
      <input
        :value="atom.label"
        class="ctrl"
        @input="(e) => update({ label: (e.target as HTMLInputElement).value })"
      />
    </Field>

    <Field label="占位符">
      <input
        :value="atom.placeholder ?? ''"
        class="ctrl"
        @input="(e) => update({ placeholder: (e.target as HTMLInputElement).value })"
      />
    </Field>

    <Field label="帮助文案">
      <input
        :value="atom.help ?? ''"
        class="ctrl"
        @input="(e) => update({ help: (e.target as HTMLInputElement).value })"
      />
    </Field>

    <Field label="">
      <label class="checkbox-row">
        <input
          type="checkbox"
          :checked="atom.required"
          @change="(e) => update({ required: (e.target as HTMLInputElement).checked })"
        />
        <span>默认必填</span>
      </label>
    </Field>

    <template v-if="atom.type === 'number' || atom.type === 'delay'">
      <Field label="最小值">
        <input
          type="number"
          :value="atom.min ?? ''"
          class="ctrl"
          @input="onNumber('min', $event)"
        />
      </Field>
      <Field label="最大值">
        <input
          type="number"
          :value="atom.max ?? ''"
          class="ctrl"
          @input="onNumber('max', $event)"
        />
      </Field>
    </template>

    <Field v-if="atom.type === 'select'" label="选项">
      <OptionEditor
        :options="atom.options ?? []"
        @change="(opts) => update({ options: opts })"
      />
    </Field>

    <div class="subtitle">默认值</div>
    <AtomInput
      :atom="atom"
      :value="atom.defaultValue"
      :on-change="(v) => update({ defaultValue: v })"
    />

    <RuleEditor
      :atom="atom"
      :candidate-fields="otherFields"
      @change="(rules) => update({ rules })"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, h, defineComponent } from 'vue'
import type { FormAtom, SelectOption } from '@/types/formSchema'
import AtomInput from './AtomInput.vue'
import RuleEditor from './RuleEditor.vue'

const props = defineProps<{
  atom: FormAtom
  candidateFields: FormAtom[]
}>()

const emit = defineEmits<{
  (e: 'update', patch: Partial<FormAtom>): void
}>()

const otherFields = computed(() =>
  props.candidateFields.filter((f) => f.id !== props.atom.id),
)

function update(patch: Partial<FormAtom>) {
  emit('update', patch)
}

function onNumber(key: 'min' | 'max', e: Event) {
  const raw = (e.target as HTMLInputElement).value
  if (raw === '') {
    update({ [key]: undefined } as Partial<FormAtom>)
  } else {
    const n = Number(raw)
    update({ [key]: Number.isFinite(n) ? n : undefined } as Partial<FormAtom>)
  }
}

// ---------- Field 子组件 ----------
const Field = defineComponent({
  name: 'Field',
  props: { label: { type: String, default: '' } },
  setup(p, { slots }) {
    return () =>
      h('div', { class: 'field' }, [
        p.label ? h('div', { class: 'field-label' }, p.label) : null,
        slots.default ? slots.default() : null,
      ])
  },
})

// ---------- OptionEditor 子组件 ----------
const OptionEditor = defineComponent({
  name: 'OptionEditor',
  props: {
    options: { type: Array as () => SelectOption[], required: true },
  },
  emits: {
    change: (_opts: SelectOption[]) => true,
  },
  setup(p, { emit }) {
    const update = (i: number, k: 'label' | 'value', v: string) => {
      const next = p.options.slice()
      next[i] = { ...next[i], [k]: v }
      ;(emit as (e: 'change', opts: SelectOption[]) => void)('change', next)
    }
    return () =>
      h('div', null, [
        ...p.options.map((o, i) =>
          h('div', { class: 'opt-row', key: i }, [
            h('input', {
              class: 'ctrl',
              style: { flex: '1' },
              value: o.label,
              placeholder: 'label',
              onInput: (e: Event) =>
                update(i, 'label', (e.target as HTMLInputElement).value),
            }),
            h('input', {
              class: 'ctrl',
              style: { flex: '1' },
              value: String(o.value),
              placeholder: 'value',
              onInput: (e: Event) =>
                update(i, 'value', (e.target as HTMLInputElement).value),
            }),
            h(
              'button',
              {
                class: 'del-btn',
                title: '删除',
                onClick: () =>
                  (emit as (e: 'change', opts: SelectOption[]) => void)(
                    'change',
                    p.options.filter((_, j) => j !== i),
                  ),
              },
              '×',
            ),
          ]),
        ),
        h(
          'button',
          {
            class: 'add-btn',
            onClick: () =>
              (emit as (e: 'change', opts: SelectOption[]) => void)('change', [
                ...p.options,
                {
                  label: `选项${p.options.length + 1}`,
                  value: `opt${p.options.length + 1}`,
                },
              ]),
          },
          '+ 添加选项',
        ),
      ])
  },
})
</script>

<style scoped>
.inspector {
  padding: 12px;
  overflow-y: auto;
  height: 100%;
  box-sizing: border-box;
}
.title {
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 8px;
}
.subtitle {
  font-size: 11px;
  color: #94a3b8;
  margin: 12px 0 4px;
}
.field {
  margin-bottom: 8px;
}
.field-label {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 2px;
}
.ctrl {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
  background: #fff;
  color: #0f172a;
}
.ctrl:disabled {
  background: #f1f5f9;
  color: #94a3b8;
}
.checkbox-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  cursor: pointer;
}
.opt-row {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}
.del-btn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: #ef4444;
  cursor: pointer;
  font-size: 14px;
  flex-shrink: 0;
}
.add-btn {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px dashed #cbd5e1;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  color: #64748b;
}
.add-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}
</style>

<template>
  <section class="panel">
    <h2>Giveaway作成ロール編集 (Vue)</h2>
    <p class="hint">カンマ区切りでロールIDを入力してください。</p>
    <input v-model="rawRoleIds" class="input" placeholder="123,456,789" />
    <div class="actions">
      <button @click="loadRoles">再読込</button>
      <button @click="saveRoles">保存</button>
    </div>
    <p v-if="message" class="message">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

const props = defineProps<{
  apiBase: string;
  guildId: string;
  adminToken: string;
}>();

const rawRoleIds = ref('');
const message = ref('');

const parseRoleIds = (): string[] => {
  return rawRoleIds.value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const loadRoles = async () => {
  const res = await fetch(`${props.apiBase}/api/roles/${props.guildId}`);
  const data = await res.json();
  rawRoleIds.value = (data.roleIds ?? []).join(', ');
  message.value = 'ロール設定を読み込みました。';
};

const saveRoles = async () => {
  const res = await fetch(`${props.apiBase}/api/roles/${props.guildId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': props.adminToken
    },
    body: JSON.stringify({ roleIds: parseRoleIds() })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? '保存に失敗しました。');
  }

  message.value = 'ロール設定を保存しました。';
};

onMounted(async () => {
  try {
    await loadRoles();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '読み込みに失敗しました。';
  }
});
</script>

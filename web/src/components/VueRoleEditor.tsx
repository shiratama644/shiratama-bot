import { createApp, type App as VueApp } from 'vue';
import { useEffect, useRef } from 'react';
import RoleEditor from './RoleEditor.vue';

type Props = {
  apiBase: string;
  guildId: string;
  adminToken: string;
};

export function VueRoleEditor({ apiBase, guildId, adminToken }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const app: VueApp = createApp(RoleEditor, { apiBase, guildId, adminToken });
    app.mount(containerRef.current);

    return () => {
      app.unmount();
    };
  }, [apiBase, guildId, adminToken]);

  return <div ref={containerRef} />;
}

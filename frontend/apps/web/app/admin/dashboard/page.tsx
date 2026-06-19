import type { Metadata } from 'next';
import { HomeFooter } from '../../../src/components/home/Footer';
import { Header } from '../../../src/components/home/Header';
import { AdminPanelWorkspace } from '../../../src/components/admin/AdminPanelWorkspace';
import { homeMockData } from '../../../src/features/home/mockData';
import { getHomeText } from '../../../src/i18n/home';
import type { Locale } from '../../../src/types/home';

export const metadata: Metadata = {
  title: 'Panel de Administración | Canticum',
  description: 'Gestión centralizada del catálogo, usuarios y contenido editorial.'
};

export default function AdminDashboardPage() {
  const locale: Locale = 'es';
  const text = getHomeText(locale);

  return (
    <main className="home-page create-page-root admin-dashboard-page">
      <div className="home-shell">
        <Header text={text} />
        <AdminPanelWorkspace />
        <HomeFooter
          text={{
            footerKnowTitle: text.footerKnowTitle,
            footerKnowDescription: text.footerKnowDescription,
            footerCopyright: text.footerCopyright
          }}
          sections={homeMockData.footerSections}
        />
      </div>
    </main>
  );
}

import type { FooterSection, HomeText } from '../../types/home';

interface HomeFooterProps {
  text: Pick<HomeText, 'footerKnowTitle' | 'footerKnowDescription' | 'footerCopyright'>;
  sections: FooterSection[];
}

export function HomeFooter({ text, sections }: HomeFooterProps) {
  return (
    <>
      <footer className="home-footer layout-h-margin">
        <div>
          <h4>{text.footerKnowTitle}</h4>
          <p>{text.footerKnowDescription}</p>
        </div>

        {sections.map((section) => (
          <div key={section.id}>
            <h4>{section.title}</h4>
            {section.links.map((link) => (
              <a key={link.id} href={link.href}>
                {link.label}
              </a>
            ))}
          </div>
        ))}
      </footer>

      <p className="copyright layout-h-margin">{text.footerCopyright}</p>
    </>
  );
}

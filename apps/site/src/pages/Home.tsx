import { useEffect, useRef } from 'react';
import { APP_URL } from '../config';
import markup from '../redesign/template.html?raw';
import { mountHomepage } from '../redesign/controller';
import '../redesign/redesign.css';

/** Trusted build-time template, never account or AI input. */
export default function Home() {
 const root = useRef<HTMLDivElement>(null);
 useEffect(() => { if (root.current) return mountHomepage(root.current, APP_URL); }, []);
 return <div ref={root} className="emm-home" dangerouslySetInnerHTML={{ __html: markup }} />;
}

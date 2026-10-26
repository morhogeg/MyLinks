import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

/**
 * The 1200x630 link-preview card (X, LinkedIn, iMessage, Slack, search) for the
 * public website. Rendered once at build time. The look is the app icon's: the
 * graphite ground and the lit porcelain citation mark (geometry copied from
 * `public/icon.svg`), with Geist for type. Hex values are allowed here only
 * because an image renderer cannot read CSS variables; they are the dark-theme
 * tokens from `app/globals.css`.
 */
export const OG_SIZE = { width: 1200, height: 630 };

const MARK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="261 268 502 464">'
    + '<defs><linearGradient id="i" gradientUnits="userSpaceOnUse" x1="0" y1="268" x2="0" y2="732">'
    + '<stop offset="0" stop-color="#FFFFFF"/><stop offset=".42" stop-color="#F2F5FA"/><stop offset="1" stop-color="#CBD2E0"/>'
    + '</linearGradient></defs>'
    + '<path d="M261.4 268 L377.4 268 L377.4 335.3 L328.7 335.3 L328.7 664.7 L377.4 664.7 L377.4 732 L261.4 732 Z" fill="url(#i)"/>'
    + '<path d="M762.6 268 L646.6 268 L646.6 335.3 L695.3 335.3 L695.3 664.7 L646.6 664.7 L646.6 732 L762.6 732 Z" fill="url(#i)"/>'
    + '<circle cx="512" cy="500" r="60.32" fill="url(#i)"/></svg>';
const MARK_SRC = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString('base64')}`;

async function font(weight: 'Regular' | 'SemiBold') {
    return readFile(join(process.cwd(), `node_modules/geist/dist/fonts/geist-sans/Geist-${weight}.ttf`));
}

export async function ogImage({ kicker, title, footer }: {
    kicker?: string;
    title: string;
    footer: string;
}) {
    const long = title.length > 48;
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '72px 80px',
                    color: '#E5E5E5',
                    fontFamily: 'Geist',
                    background: 'radial-gradient(circle at 50% 18%, #282833 0%, #16161D 42%, #07070A 100%)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <img src={MARK_SRC} width={56} height={52} alt="" />
                    <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: -0.5 }}>Machina</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                    {kicker && (
                        <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: 4, textTransform: 'uppercase', color: '#858585' }}>
                            {kicker}
                        </span>
                    )}
                    {/* A "\n" in the title is a forced break (the tagline breaks
                        at its comma, as the landing's H1 does). */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {title.split('\n').map((line) => (
                            <span
                                key={line}
                                style={{
                                    fontSize: long ? 64 : 78,
                                    fontWeight: 600,
                                    lineHeight: 1.08,
                                    letterSpacing: -2,
                                    color: '#F2F5FA',
                                    maxWidth: 1040,
                                }}
                            >
                                {line}
                            </span>
                        ))}
                    </div>
                </div>
                <span style={{ fontSize: 26, color: '#A0A0A0' }}>{footer}</span>
            </div>
        ),
        {
            ...OG_SIZE,
            fonts: [
                { name: 'Geist', data: await font('Regular'), weight: 400, style: 'normal' },
                { name: 'Geist', data: await font('SemiBold'), weight: 600, style: 'normal' },
            ],
        },
    );
}

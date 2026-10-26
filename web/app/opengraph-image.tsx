import { ogImage, OG_SIZE } from '@/lib/ogImage';
import { TAGLINE } from '@/lib/site';

// The site-wide preview card; blog posts override it with their own title.
export const dynamic = 'force-static';
export const alt = `Machina: ${TAGLINE}`;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return ogImage({
        title: TAGLINE.replace(', ', ',\n'),
        footer: 'Save from any app. Ask what you saved. mymachina.app',
    });
}

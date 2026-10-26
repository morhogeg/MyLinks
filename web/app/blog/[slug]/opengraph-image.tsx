import { ogImage, OG_SIZE } from '@/lib/ogImage';
import { POSTS, getPost } from '@/lib/blog';

// Each article's own preview card: its title on the site's card.
export const dynamicParams = false;
export const alt = 'Machina blog';
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams() {
    return POSTS.map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const post = getPost((await params).slug);
    return ogImage({
        kicker: post?.category ?? 'Blog',
        title: post?.title ?? 'Machina blog',
        footer: 'mymachina.app/blog',
    });
}

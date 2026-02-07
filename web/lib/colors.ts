/**
 * Category color mapping with RGB values for inline styles
 */

interface CategoryColorStyle {
    backgroundColor: string;
    color: string;
    borderColor: string;
}

const categoryColorStyles: Record<string, CategoryColorStyle> = {
    purple: {
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        color: 'rgb(168, 85, 247)',
        borderColor: 'rgba(168, 85, 247, 0.2)',
    },
    blue: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        color: 'rgb(59, 130, 246)',
        borderColor: 'rgba(59, 130, 246, 0.2)',
    },
    green: {
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        color: 'rgb(34, 197, 94)',
        borderColor: 'rgba(34, 197, 94, 0.2)',
    },
    yellow: {
        backgroundColor: 'rgba(234, 179, 8, 0.1)',
        color: 'rgb(234, 179, 8)',
        borderColor: 'rgba(234, 179, 8, 0.2)',
    },
    red: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        color: 'rgb(239, 68, 68)',
        borderColor: 'rgba(239, 68, 68, 0.2)',
    },
    pink: {
        backgroundColor: 'rgba(236, 72, 153, 0.1)',
        color: 'rgb(236, 72, 153)',
        borderColor: 'rgba(236, 72, 153, 0.2)',
    },
    indigo: {
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        color: 'rgb(99, 102, 241)',
        borderColor: 'rgba(99, 102, 241, 0.2)',
    },
    teal: {
        backgroundColor: 'rgba(20, 184, 166, 0.1)',
        color: 'rgb(20, 184, 166)',
        borderColor: 'rgba(20, 184, 166, 0.2)',
    },
    orange: {
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        color: 'rgb(249, 115, 22)',
        borderColor: 'rgba(249, 115, 22, 0.2)',
    },
    cyan: {
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        color: 'rgb(6, 182, 212)',
        borderColor: 'rgba(6, 182, 212, 0.2)',
    },
};

const colorKeys = Object.keys(categoryColorStyles);

/**
 * Generate consistent inline styles for a category
 */
export function getCategoryColorStyle(category: string): CategoryColorStyle {
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
        hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % colorKeys.length;
    const colorKey = colorKeys[index];
    return categoryColorStyles[colorKey];
}

/**
 * Legacy function - returns complete Tailwind class string
 * Kept for components using class-based approach
 */
export function getCategoryColor(category: string): string {
    const colorClasses: Record<string, string> = {
        purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
        blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        green: 'bg-green-500/10 text-green-500 border-green-500/20',
        yellow: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        red: 'bg-red-500/10 text-red-500 border-red-500/20',
        pink: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
        indigo: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
        teal: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
        orange: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
        cyan: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    };

    let hash = 0;
    for (let i = 0; i < category.length; i++) {
        hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }

    const colorKeysList = Object.keys(colorClasses);
    const index = Math.abs(hash) % colorKeysList.length;
    const colorKey = colorKeysList[index];
    return colorClasses[colorKey];
}

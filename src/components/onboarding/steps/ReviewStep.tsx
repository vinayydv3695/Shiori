import { useOnboardingStore } from "../../../store/onboardingStore";
import { Check, Settings, Layout, Monitor, BookOpen, Zap, Database, Folder, ShieldCheck } from "lucide-react";
import React from "react";
import { motion } from "framer-motion";

const LANGUAGE_NAMES: Record<string, string> = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German', ja: 'Japanese',
    zh: 'Chinese', ko: 'Korean', pt: 'Portuguese', ru: 'Russian', ar: 'Arabic',
};

function Section({ title, icon: Icon, children }: { title: string, icon: React.ElementType, children: React.ReactNode }) {
    return (
        <div className="space-y-4">
            <h3 className="text-sm font-bold text-muted-foreground flex items-center gap-3 uppercase tracking-wider">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <Icon className="w-4 h-4" />
                </div>
                {title}
            </h3>
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5 shadow-sm space-y-4 hover:border-primary/20 transition-colors">
                {children}
            </div>
        </div>
    );
}

function Item({ label, value }: { label: string, value: string | React.ReactNode }) {
    if (value === undefined || value === null || value === '') return null;
    return (
        <div className="flex justify-between items-center border-b border-border/30 pb-3 last:border-0 last:pb-0">
            <span className="text-muted-foreground font-medium">{label}</span>
            <span className="font-bold text-foreground text-right">{value}</span>
        </div>
    );
}

export function ReviewStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);

    const goalMinutes = draftConfig.dailyReadingGoalMinutes ?? 30;
    const translationLang = draftConfig.translationTargetLanguage || 'en';

    const formatMangaDirection = (dir?: string) => {
        if (dir === 'rtl') return 'Right to Left';
        if (dir === 'ltr') return 'Left to Right';
        return dir;
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 15 },
        show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
    };

    return (
        <div className="w-full space-y-10 py-6 px-4 max-w-3xl mx-auto">
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4 mb-8"
            >
                <div className="flex justify-center mb-6">
                    <div className="relative">
                        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
                        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/20 shadow-xl shadow-primary/10">
                            <Settings className="w-10 h-10 text-primary animate-[spin_6s_linear_infinite]" />
                        </div>
                    </div>
                </div>
                <h2 className="text-4xl font-extrabold tracking-tight">You're All Set!</h2>
                <p className="text-lg text-muted-foreground font-medium max-w-lg mx-auto">
                    Shiori has been perfectly tuned to your preferences. Review your setup below.
                </p>
            </motion.div>

            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
                <motion.div variants={itemVariants}>
                    <Section title="Content Profile" icon={Layout}>
                        <Item label="Formats" value={<span className="capitalize">{draftConfig.preferredContentType || 'Both Books & Manga'}</span>} />
                        {draftConfig.preferredContentType !== 'books' && draftConfig.manga && (
                            <>
                                <Item label="Manga Mode" value={<span className="capitalize">{draftConfig.manga.mode}</span>} />
                                <Item label="Direction" value={formatMangaDirection(draftConfig.manga.direction)} />
                            </>
                        )}
                    </Section>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <Section title="Appearance" icon={Monitor}>
                        <Item label="Theme" value={<span className="capitalize">{draftConfig.theme || 'Default'}</span>} />
                        {draftConfig.uiScale && <Item label="Scale" value={`${Math.round(draftConfig.uiScale * 100)}%`} />}
                        {draftConfig.uiDensity && <Item label="Density" value={<span className="capitalize">{draftConfig.uiDensity}</span>} />}
                        {draftConfig.accentColor && (
                            <div className="flex justify-between items-center border-b border-border/30 pb-3 last:border-0 last:pb-0">
                                <span className="text-muted-foreground font-medium">Accent Color</span>
                                <div className="w-6 h-6 rounded-full border-2 border-background shadow-md" style={{ backgroundColor: draftConfig.accentColor }} />
                            </div>
                        )}
                    </Section>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <Section title="Reading" icon={BookOpen}>
                        <Item label="Daily Goal" value={`${goalMinutes} min/day`} />
                        <Item label="Translation" value={LANGUAGE_NAMES[translationLang] || translationLang} />
                        {draftConfig.book && (
                            <>
                                <Item label="Scroll Mode" value={<span className="capitalize">{draftConfig.book.scrollMode}</span>} />
                                <Item label="Justification" value={<span className="capitalize">{draftConfig.book.justification}</span>} />
                            </>
                        )}
                    </Section>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <Section title="System" icon={Zap}>
                        <Item label="Engine" value={<span className="capitalize">{draftConfig.performanceMode?.replace('_', ' ') || 'Standard'}</span>} />
                        {draftConfig.cacheSizeLimitMB && <Item label="Cache Limit" value={`${draftConfig.cacheSizeLimitMB} MB`} />}
                        <Item label="Metadata" value={<span className="capitalize">{draftConfig.metadataMode || 'Online'}</span>} />
                    </Section>
                </motion.div>

                <motion.div variants={itemVariants} className="md:col-span-2">
                    <Section title="Library Paths" icon={Folder}>
                        <Item label="Books" value={<span className="truncate max-w-[250px] sm:max-w-[400px] block" title={draftConfig.defaultImportPath}>{draftConfig.defaultImportPath || 'Not set yet'}</span>} />
                        {(draftConfig.preferredContentType === 'manga' || draftConfig.preferredContentType === 'both') && (
                            <Item label="Manga" value={<span className="truncate max-w-[250px] sm:max-w-[400px] block" title={draftConfig.defaultMangaPath || ''}>{draftConfig.defaultMangaPath || 'Not set yet'}</span>} />
                        )}
                        <Item label="Auto-Scan" value={draftConfig.autoScanEnabled !== false ? "Enabled" : "Disabled"} />
                    </Section>
                </motion.div>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex items-center justify-center gap-3 text-sm font-bold text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 p-5 rounded-2xl shadow-sm"
            >
                <ShieldCheck className="w-6 h-6 flex-shrink-0" />
                Settings will be securely committed to your local database.
            </motion.div>
        </div>
    );
}

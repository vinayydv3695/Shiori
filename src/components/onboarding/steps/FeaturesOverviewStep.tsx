import { Highlighter, BarChart3, Volume2, Heart, Languages, HardDrive } from 'lucide-react';

export function FeaturesOverviewStep() {
  const features = [
    {
      icon: Highlighter,
      title: "Annotations & Highlights",
      description: "8 highlight colors, categories, notes, and global search across all your annotations",
      color: "text-amber-500",
      bgColor: "bg-amber-500/10"
    },
    {
      icon: BarChart3,
      title: "Reading Statistics",
      description: "Track daily reading time, set goals, view weekly charts and reading streaks",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10"
    },
    {
      icon: Volume2,
      title: "Text-to-Speech",
      description: "Listen to your books with adjustable voice, speed, and sentence highlighting",
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10"
    },
    {
      icon: Heart,
      title: "Shelves & Favorites",
      description: "Organize books into custom shelves and mark favorites for quick access",
      color: "text-rose-500",
      bgColor: "bg-rose-500/10"
    },
    {
      icon: Languages,
      title: "Translation & Dictionary",
      description: "Select text to instantly translate or look up definitions while reading",
      color: "text-indigo-500",
      bgColor: "bg-indigo-500/10"
    },
    {
      icon: HardDrive,
      title: "Backup & Restore",
      description: "Export your entire library and settings to a ZIP file, restore anytime",
      color: "text-slate-500",
      bgColor: "bg-slate-500/10"
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Discover What's New</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Shiori comes packed with powerful features to enhance your reading experience.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
        {features.map((feature, idx) => {
          const Icon = feature.icon;
          return (
            <div 
              key={idx} 
              className="bg-card border border-border rounded-xl p-5 flex items-start space-x-4 transition-all duration-300 hover:bg-accent/50 hover:border-primary/30 group hover:shadow-sm"
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <div className={`p-3 rounded-xl ${feature.bgColor} ${feature.color} shrink-0 transition-transform duration-300 group-hover:scale-110`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 pt-0.5">
                <p className="font-semibold leading-none tracking-tight">{feature.title}</p>
                <p className="text-sm text-muted-foreground leading-snug">{feature.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
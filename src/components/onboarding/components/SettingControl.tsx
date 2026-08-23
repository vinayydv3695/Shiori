import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SettingOption = {
  label: string;
  value: string | number;
};

export type SettingControlType = 'slider' | 'toggle' | 'select' | 'radio' | 'input';

type SettingControlProps = {
  label: string;
  description?: string;
  type: SettingControlType;
  value: unknown;
  onChange: (value: unknown) => void;
  options?: SettingOption[];
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  theme?: 'default' | 'darkSlate';
};

export function SettingControl({
  label,
  description,
  type,
  value,
  onChange,
  options = [],
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
}: SettingControlProps) {
  const inputId = `setting-control-${label.toLowerCase().replace(/\s+/g, '-')}`;

  const inputBase =
    'w-full rounded-xl border border-border/50 bg-background/60 px-3 py-2 text-sm text-foreground backdrop-blur-md transition hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:cursor-not-allowed disabled:opacity-50';

  const renderControl = () => {
    switch (type) {
      case 'slider':
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>{min}</span>
              <span className="rounded-md px-2 py-0.5 border border-border/60 bg-background/80 font-bold text-foreground shadow-xs">
                {String(value)}
              </span>
              <span>{max}</span>
            </div>
            <input
              id={inputId}
              type="range"
              value={typeof value === 'number' ? value : Number(value) || min}
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              onChange={(e) => onChange(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted/60 accent-primary disabled:cursor-not-allowed"
            />
          </div>
        );

      case 'toggle':
        return (
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              id={inputId}
              type="checkbox"
              checked={Boolean(value)}
              disabled={disabled}
              onChange={(e) => onChange(e.target.checked)}
              className="peer sr-only"
            />
            <div className="h-6 w-11 rounded-full border border-border/60 bg-muted/50 backdrop-blur-md transition peer-checked:bg-primary peer-checked:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/70 peer-disabled:opacity-50" />
            <div className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-md transition-transform peer-checked:translate-x-5" />
          </label>
        );

      case 'select':
        return (
          <Select
            value={String(value)}
            onValueChange={onChange}
            disabled={disabled}
          >
            <SelectTrigger className="w-full bg-background/60 border-border/50 text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={String(option.value)} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'radio':
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((option) => {
              const checked = String(value) === String(option.value);
              return (
                <label
                  key={String(option.value)}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2.5 backdrop-blur-md transition font-medium text-sm ${
                    checked
                      ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30 shadow-xs'
                      : 'border-border/40 bg-background/40 text-foreground/80 hover:bg-background/80 hover:border-border/80'
                  } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <input
                    type="radio"
                    name={inputId}
                    value={String(option.value)}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onChange(option.value)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        );

      case 'input': {
        const isNumber = typeof value === 'number';
        return (
          <input
            id={inputId}
            type={isNumber ? 'number' : 'text'}
            disabled={disabled}
            value={value == null ? '' : String(value)}
            onChange={(e) => onChange(isNumber ? Number(e.target.value) : e.target.value)}
            className={inputBase}
          />
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="rounded-2xl p-4 border border-border/40 bg-card/60 backdrop-blur-xl shadow-xs">
      <div className="mb-3">
        <label htmlFor={inputId} className="text-sm font-semibold text-foreground">
          {label}
        </label>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {renderControl()}
    </div>
  );
}

export default SettingControl;

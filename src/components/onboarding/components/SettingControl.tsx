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
  theme = 'default',
}: SettingControlProps) {
  const inputId = `setting-control-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const isDarkSlate = theme === 'darkSlate';

  const inputBase = isDarkSlate
    ? 'w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white backdrop-blur-md transition hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark]'
    : 'w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-foreground backdrop-blur-md transition hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:cursor-not-allowed disabled:opacity-50';

  const renderControl = () => {
    switch (type) {
      case 'slider':
        return (
          <div className="space-y-2">
            <div className={`flex items-center justify-between text-xs ${isDarkSlate ? 'text-white/60' : 'text-muted-foreground'}`}>
              <span>{min}</span>
              <span
                className={`rounded-md px-2 py-0.5 backdrop-blur-md ${
                  isDarkSlate ? 'border border-white/10 bg-black text-white' : 'border border-white/20 bg-white/10 text-foreground'
                }`}
              >
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
              className={`h-2 w-full cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed ${
                isDarkSlate ? 'bg-white/20 accent-indigo-500' : 'bg-white/20 accent-primary'
              }`}
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
            <div
              className={`h-6 w-11 rounded-full border backdrop-blur-md transition peer-disabled:opacity-50 ${
                isDarkSlate
                  ? 'border-white/20 bg-black peer-checked:bg-indigo-500 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400/70'
                  : 'border-white/20 bg-white/20 peer-checked:bg-primary/80 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/70'
              }`}
            />
            <div className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-5" />
          </label>
        );

      case 'select':
        return (
          <div className="relative">
            <select
              id={inputId}
              disabled={disabled}
              value={String(value)}
              onChange={(e) => onChange(e.target.value)}
              className={`${inputBase} appearance-none pr-12 ${
                isDarkSlate
                  ? 'border-indigo-400/30 bg-indigo-950/40 text-indigo-100 hover:border-indigo-300/45 focus:border-indigo-300/60 focus-visible:ring-indigo-400/45'
                  : ''
              }`}
              style={isDarkSlate ? { colorScheme: 'dark' } : undefined}
            >
              {options.map((option) => (
                <option
                  key={String(option.value)}
                  value={String(option.value)}
                  className={isDarkSlate ? 'bg-slate-950 text-indigo-100' : 'bg-background text-foreground'}
                >
                  {option.label}
                </option>
              ))}
            </select>
            <div
              className={`pointer-events-none absolute inset-y-1 right-1 flex items-center rounded-lg px-2 ${
                isDarkSlate ? 'border border-indigo-300/20 bg-indigo-900/50 text-indigo-200/80' : 'text-white/50'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </div>
          </div>
        );

      case 'radio':
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((option) => {
              const checked = String(value) === String(option.value);
              return (
                <label
                  key={String(option.value)}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 backdrop-blur-md transition ${
                    checked
                      ? isDarkSlate
                        ? 'border-indigo-400/60 bg-indigo-500/15 text-white'
                        : 'border-primary/60 bg-primary/15 text-foreground'
                      : isDarkSlate
                        ? 'border-white/10 bg-black text-white/70 hover:bg-slate-950'
                        : 'border-white/20 bg-white/10 hover:bg-white/15'
                  } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <input
                    type="radio"
                    name={inputId}
                    value={String(option.value)}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onChange(option.value)}
                    className={`h-4 w-4 ${isDarkSlate ? 'accent-indigo-500' : 'accent-primary'}`}
                  />
                  <span className={`text-sm ${isDarkSlate ? 'text-white/80' : ''}`}>{option.label}</span>
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
    <>
      <div
        className={`rounded-2xl p-4 backdrop-blur-xl ${
          isDarkSlate ? 'border border-white/10 bg-slate-900/50' : 'border border-white/15 bg-white/5'
        }`}
      >
        <div className="mb-3">
          <label htmlFor={inputId} className={`text-sm font-semibold ${isDarkSlate ? 'text-white' : 'text-foreground'}`}>
            {label}
          </label>
          {description && <p className={`mt-1 text-xs ${isDarkSlate ? 'text-white/60' : 'text-muted-foreground'}`}>{description}</p>}
        </div>
        {renderControl()}
      </div>
      {isDarkSlate && (
        <style>{`
          #${inputId} option {
            background-color: #020617 !important;
            color: #e0e7ff !important;
          }
        `}</style>
      )}
    </>
  );
}

export default SettingControl;

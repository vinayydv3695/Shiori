# Shiori OnboardingWizard Audit Report

**Date**: 2026-03-08  
**Component**: `src/components/onboarding/OnboardingWizard.tsx`  
**Store**: `src/store/onboardingStore.ts`  
**Purpose**: Understand existing onboarding flow and identify gaps for new feature documentation

---

## 1. CURRENT ONBOARDING SLIDES (16 Total)

### Slide Order & Configuration

| # | Step ID | Title | Content Summary | Condition | Component |
|---|---------|-------|-----------------|-----------|-----------|
| 1 | `welcome` | Welcome to Shiori | Intro + benefits checklist | Always shown | `WelcomeStep` |
| 2 | `features-overview` | Feature Overview | High-level app capabilities | Always shown | `FeaturesOverviewStep` |
| 3 | `content-type` | Content Type Selection | Choose: Books, Manga, or Both | Always shown | `ContentTypeStep` |
| 4 | `comic-setup` | Comic Setup | Comic/manga-specific config | `if preferredContentType === 'both' OR 'manga'` | `ComicSetupStep` |
| 5 | `theme` | Theme Selection | Dark/light/auto theme choice | Always shown | `ThemeStep` |
| 6 | `reading-prefs` | Reading Preferences | Book reading settings (view mode, font, etc.) | `if preferredContentType === 'both' OR 'books'` | `ReadingPrefsStep` |
| 7 | `manga-prefs` | Manga Preferences | Manga-specific settings (reading direction, etc.) | `if preferredContentType === 'both' OR 'manga'` | `MangaPrefsStep` |
| 8 | `reading-goal` | Reading Goal | Set daily reading goal (minutes) | Always shown | `ReadingGoalStep` |
| 9 | `reading-status` | Reading Status | Configure reading status preferences | Always shown | `ReadingStatusStep` |
| 10 | `translation` | Translation Language | Set translation target language | Always shown | `TranslationStep` |
| 11 | `performance` | Performance Config | Caching and performance mode settings | Always shown | `PerformanceStep` |
| 12 | `metadata` | Metadata Handling | Intro to metadata enrichment | `if navigator.onLine` | `MetadataStep` |
| 13 | `metadata-search` | Metadata Search | Show supported metadata sources (AniList, OpenLibrary) | `if navigator.onLine` | `MetadataSearchStep` |
| 14 | `library-setup` | Library Setup | Configure library directories and import settings | Always shown | `LibrarySetupStep` |
| 15 | `ui-scale` | UI Scale | Adjust UI scaling/zoom level | Always shown | `UiScaleStep` |
| 16 | `review` | Review & Finish | Summary of all selected preferences with confirmation | Always shown | `ReviewStep` |

---

## 2. MISSING FEATURES (New Features NOT in Onboarding)

Based on the context provided, these recent features are **NOT documented** in the onboarding:

### High Priority Additions

1. **Info Button (Cmd/Ctrl+I) - Book Details & Metadata Search**
   - Users don't know about the Info button keyboard shortcut
   - No explanation of how to access metadata search from book details
   - Missing: Step showing the Info button functionality and keyboard shortcut

2. **Manga Series Grouping Feature**
   - No step explaining manga series auto-grouping capability
   - Users unaware of series organization benefits
   - Missing: Step showing how to group manga volumes by series

3. **Auto-Group Manga Button**
   - Not mentioned anywhere in onboarding
   - Users don't know this exists in Import dropdown (manga_comics domain only)
   - Missing: Reference in existing or new step

4. **Series Management Dialogs**
   - Edit series names and properties
   - Assign/reassign books to series
   - Merge and split series operations
   - **Missing**: Dedicated step for series management workflows

### Moderate Priority Additions

- Best practices for organizing manga libraries
- How to leverage metadata sources for manga series identification
- Tips for using series grouping alongside collections/tags

---

## 3. TECHNICAL STRUCTURE GUIDE

### 3.1 How Slides Are Defined

**Location**: `src/store/onboardingStore.ts` (lines 7-65)

```typescript
// Step IDs are typed as union
export type StepId = 
    | 'welcome'
    | 'features-overview'
    | 'comic-setup'
    // ... etc

// Global registry with conditional rendering
export const ONBOARDING_STEPS: StepRegistryItem[] = [
    { id: 'welcome' },
    { id: 'features-overview' },
    {
        id: 'comic-setup',
        condition: (draft) => draft.preferredContentType === 'both' || draft.preferredContentType === 'manga'
    },
    // ... etc
];
```

**Key Concepts**:
- Steps are registered in `ONBOARDING_STEPS` array in **logical order**
- Each step has `id` (required) and optional `condition` function
- Conditions evaluate against current draft config to determine if step shows
- Steps **can be skipped** based on user choices (e.g., manga steps skipped if "Books only")

### 3.2 Navigation Mechanism

**Location**: `src/components/onboarding/OnboardingWizard.tsx` (lines 45-56)

```typescript
const handleNext = async () => {
    if (isLastStep) {
        await commit(); // Save all preferences to backend
        onComplete();
    } else {
        nextStep(); // Move to next active step
    }
};

// Navigation respects active steps only
const activeSteps = ONBOARDING_STEPS.filter(step => 
    !step.condition || step.condition(draftConfig)
);
const currentIndex = activeSteps.findIndex(s => s.id === currentStepId);
```

**Navigation Features**:
- Back button: Disabled on first step
- Next button: Becomes "Finish Setup" on last step
- Progress bar: Shows percentage based on current index / total active steps
- Forward/backward properly handles conditional skipping

### 3.3 How to Add New Slides

#### Step 1: Add Step ID to Union Type
```typescript
// src/store/onboardingStore.ts (line 8-24)
export type StepId = 
    | 'welcome'
    | 'features-overview'
    | 'manga-series-grouping'  // ← ADD HERE
    | 'info-button-tutorial'   // ← ADD HERE
    // ... rest of IDs
```

#### Step 2: Add to Registry with Optional Condition
```typescript
// src/store/onboardingStore.ts (line 33-65)
export const ONBOARDING_STEPS: StepRegistryItem[] = [
    // ... existing steps in order ...
    {
        id: 'manga-series-grouping',
        condition: (draft) => draft.preferredContentType === 'both' || draft.preferredContentType === 'manga'
    },
    {
        id: 'info-button-tutorial',
        condition: () => true // Always show
    },
    // ... rest of steps
];
```

**Important**: 
- Position in array determines **order of appearance**
- `condition` function gets evaluated against `draftConfig`
- If condition returns false, step is completely skipped

#### Step 3: Create Step Component
```typescript
// src/components/onboarding/steps/MangaSeriesGroupingStep.tsx
import { useOnboardingStore } from "../../../store/onboardingStore";

export function MangaSeriesGroupingStep() {
    // Optionally access/modify draft config
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);
    
    return (
        <div className="space-y-8 py-4 animate-in fade-in duration-500">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold">Organize Manga by Series</h2>
                <p className="text-muted-foreground">
                    Automatically group volumes into series collections.
                </p>
            </div>
            {/* Your content here */}
        </div>
    );
}
```

**Component Best Practices**:
- Use `animate-in fade-in duration-500` for consistency
- Wrap content in `<div className="space-y-8 py-4">`
- Center heading with `text-center space-y-2`
- Use Card/Icon components from `../ui/`
- Access store with hooks for data persistence

#### Step 4: Import and Add Case to Renderer
```typescript
// src/components/onboarding/OnboardingWizard.tsx (line 8-23)
import { MangaSeriesGroupingStep } from "./steps/MangaSeriesGroupingStep";
import { InfoButtonTutorialStep } from "./steps/InfoButtonTutorialStep";

// ... in renderStep() function (line 58-78)
const renderStep = () => {
    switch (currentStepId) {
        case 'manga-series-grouping': return <MangaSeriesGroupingStep />;
        case 'info-button-tutorial': return <InfoButtonTutorialStep />;
        // ... rest of cases
    }
};
```

### 3.4 State Management

**Location**: `src/store/onboardingStore.ts` (lines 67-197)

```typescript
interface OnboardingState {
    currentStepId: StepId;                    // Currently displayed step
    draftConfig: Partial<UserPreferences>;    // Transient config being filled
    isCommitting: boolean;                    // Saving in progress flag
    
    // Core actions
    init(initialPrefs?: Partial<UserPreferences>): void;
    setDraftValue<K extends keyof UserPreferences>(key: K, value: any): void;
    setDraftValues(values: Partial<UserPreferences>): void;
    nextStep(): void;
    prevStep(): void;
    commit(): Promise<void>;
    getProgress(): number;
}
```

**Key Features**:
- **Persistence**: Uses Zustand with localStorage middleware (name: 'shiori-onboarding-fsm')
- **Transient draft**: All changes stored in `draftConfig` until final commit
- **Type-safe**: `setDraftValue` is generic and type-checked
- **Progress calculation**: Based on current step index and total active steps

**Accessing Store in Steps**:
```typescript
// Read
const draftConfig = useOnboardingStore(state => state.draftConfig);
const currentStep = useOnboardingStore(state => state.currentStepId);

// Write
const setDraftValue = useOnboardingStore(state => state.setDraftValue);
setDraftValue('mangaSeriesAuto', true); // Example
```

### 3.5 Backend Integration

**Location**: `src/lib/tauri.ts`

```typescript
// Check onboarding state on app startup
async getOnboardingState(): Promise<OnboardingState> {
    return invoke("get_onboarding_state")
}

// Save preferences and mark onboarding complete
async completeOnboarding(skippedSteps: string[]): Promise<void> {
    return invoke("complete_onboarding", { skippedSteps })
}

// Reset onboarding (for testing/rerun)
async resetOnboarding(): Promise<void> {
    return invoke("reset_onboarding")
}
```

**Commit Flow** (src/store/onboardingStore.ts, lines 146-176):
1. Call `api.updateUserPreferences(draftConfig)` - Send all preferences to Rust backend
2. Call `api.updateReadingGoal(minutes)` - Separately update reading goals table
3. Call `api.completeOnboarding(skippedSteps)` - Mark wizard complete, track skipped steps
4. Call `usePreferencesStore.getState().loadPreferences()` - Hydrate main app store
5. Reset local onboarding state for cleanup

---

## 4. CURRENT GAPS & RECOMMENDATIONS

### Implementation Approach for New Slides

**Recommendation**: Create a new series of steps in phase order:

```
Phase 1: Info Button Tutorial (Universal)
├─ Step: "Discover Book Details" 
├─ Shows: Cmd/Ctrl+I keyboard shortcut
├─ Content: How to access metadata, find detailed info
└─ Placement: After `metadata-search` step

Phase 2: Manga Series Management (Conditional)
├─ Step 1: "Organize Manga by Series"
│  ├─ Content: Benefits of series grouping
│  ├─ Visual: Before/after library organization
│  └─ Placement: After `manga-prefs` step
├─ Step 2: "Auto-Group Your Collection"
│  ├─ Content: Auto-grouping feature overview
│  ├─ Feature: Demo or instructions
│  └─ Placement: Before `library-setup` step
└─ Step 3: "Manage Your Series"
   ├─ Content: Edit, merge, split, reassign series
   ├─ UI Walkthrough: Series dialogs
   └─ Placement: Before `review` step
```

### Integration Checklist

- [ ] Add step IDs to `StepId` union in `onboardingStore.ts`
- [ ] Add step registrations to `ONBOARDING_STEPS` array with appropriate conditions
- [ ] Create corresponding component files in `src/components/onboarding/steps/`
- [ ] Import components in `OnboardingWizard.tsx`
- [ ] Add switch cases in `renderStep()` function
- [ ] Test step order and conditional rendering
- [ ] Verify backend commit receives all new preference keys
- [ ] Update `ReviewStep.tsx` to display new settings if applicable

---

## 5. COMPONENT STRUCTURE SUMMARY

```
src/components/onboarding/
├── OnboardingWizard.tsx          # Main orchestrator (16 imports, switch router)
└── steps/                         # 16 individual step components
    ├── WelcomeStep.tsx
    ├── FeaturesOverviewStep.tsx
    ├── ContentTypeStep.tsx
    ├── ComicSetupStep.tsx
    ├── ThemeStep.tsx
    ├── ReadingPrefsStep.tsx
    ├── MangaPrefsStep.tsx
    ├── ReadingGoalStep.tsx
    ├── ReadingStatusStep.tsx
    ├── TranslationStep.tsx
    ├── PerformanceStep.tsx
    ├── MetadataStep.tsx
    ├── MetadataSearchStep.tsx     # ← Shows AniList/OpenLibrary
    ├── LibrarySetupStep.tsx
    ├── UiScaleStep.tsx
    └── ReviewStep.tsx             # Shows config summary before commit

src/store/
└── onboardingStore.ts            # Zustand FSM (16 step registry, draftConfig)

src/lib/
└── tauri.ts                       # Backend API (getOnboardingState, completeOnboarding, resetOnboarding)

src/App.tsx                        # Checks getOnboardingState on startup
```

---

## 6. CONTEXT ABOUT NEW FEATURES

### 1. Info Button (Cmd/Ctrl+I)
- **Shortcut**: Cmd/Ctrl+I
- **Function**: Opens book details panel with metadata search
- **Use Case**: Users can search for metadata to enrich book info
- **Onboarding Gap**: No mention of shortcut or how to use it

### 2. Manga Series Grouping
- **Auto-grouping**: Automatically groups manga volumes by series
- **Manual Management**: Dialogs to edit, assign, merge, split series
- **Domain**: Specific to `manga_comics` domain
- **Onboarding Gap**: No explanation of benefits or how to use

### 3. Auto-Group Button
- **Location**: Import dropdown (when in manga_comics domain)
- **Function**: One-click automatic series grouping
- **Onboarding Gap**: Not discoverable without trial/error

### 4. Series Management Dialogs
- **Edit Series**: Rename, modify series properties
- **Assign Books**: Add/remove volumes from series
- **Merge/Split**: Combine or separate series
- **Onboarding Gap**: No UI walkthrough or instructions

---

## 7. FILES MODIFIED IN THIS AUDIT

- ✅ **Reviewed**: `OnboardingWizard.tsx` - Main component (149 lines)
- ✅ **Reviewed**: `onboardingStore.ts` - FSM store (197 lines)
- ✅ **Sampled**: 3 step components for pattern understanding
- ✅ **Verified**: Backend API integration in `tauri.ts`

---

## 8. NEXT STEPS FOR OTHER AGENTS

1. **Design Phase**: Create visual mockups for new slides (Info button tutorial, Series management steps)
2. **Implementation Phase**: 
   - Create new step components following the established pattern
   - Add to store registry and wizard
   - Test conditional rendering based on content type
3. **Integration Phase**: 
   - Verify backend receives new preference keys
   - Update ReviewStep if new preferences should be shown
   - Add keyboard shortcut display if needed
4. **Testing Phase**: 
   - Test full onboarding flow with different content type selections
   - Verify series steps only show for manga
   - Test resume/persist of onboarding state

---

## Key Takeaways

✅ **Existing system is well-architected**: Conditional step registry, type-safe store, modular components  
✅ **Easy to extend**: Clear pattern for adding steps  
✅ **Backend-integrated**: Commits to SQLite with preference hydration  
⚠️ **Recent features missing**: Info button, manga series grouping, series management not documented  
✅ **Ready for expansion**: No architectural changes needed, just new step components


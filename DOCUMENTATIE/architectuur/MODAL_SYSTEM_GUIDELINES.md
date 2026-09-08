# Modal System Guidelines

**Versie:** 1.0  
**Laatst bijgewerkt:** mei 2026  
**Status:** ✅ VERPLICHT - Alle modals moeten deze richtlijnen volgen

---

## 🎯 Overzicht

Dit document beschrijft het uniforme modal systeem voor de Harelbekeminivoetbal.be webapp. Het systeem is **mobile-first** en zorgt voor een consistente, app-achtige ervaring op alle devices.

### Belangrijkste Kenmerken
- ✅ **Portal-based rendering** - Altijd boven alle content
- ✅ **Mobile-first design** - Ook desktop gedraagt zich app-achtig
- ✅ **Global state management** - Centraal beheer via context
- ✅ **Accessibility first** - WCAG 2.1 compliant
- ✅ **Consistent button system** - Drie vaste varianten
- ✅ **Body scroll lock** - Achtergrond scroll geblokkeerd

---

## 📐 Architectuur

### 1. Component Structuur

```
AppModal (src/components/ui/app-modal.tsx)
├── Portal Rendering (via Radix Dialog)
├── Overlay (donkere backdrop met blur)
├── Modal Container
│   ├── Header (vast, niet scrollbaar)
│   ├── Body (scrollbaar)
│   └── Footer (vast, niet scrollbaar)
```

### 2. State Management

**VERPLICHT:** Gebruik `ModalContext` voor alle modals.

```tsx
// src/context/ModalContext.tsx
import { useModal } from '@/context/ModalContext';

// In je component:
const { isLoginModalOpen, openLoginModal, closeLoginModal } = useModal();
```

**❌ VERBODEN:** Lokale state in page components
```tsx
// ❌ DOE DIT NIET
const [isModalOpen, setIsModalOpen] = useState(false);
```

### 3. Rendering Locatie

**VERPLICHT:** Modals worden gerenderd in `Layout.tsx` op root-niveau.

```tsx
// Layout.tsx
<AppModal
  open={isLoginModalOpen}
  onOpenChange={closeLoginModal}
  title="Modal Titel"
  subtitle="Optionele subtitel"
  size="sm"
  showCloseButton={true}
>
  <ModalContent onSuccess={handleSuccess} />
</AppModal>
```

**❌ VERBODEN:** Modal in page component
```tsx
// ❌ DOE DIT NIET
// /pages/SomePage.tsx
return (
  <div>
    <AppModal>...</AppModal>
  </div>
);
```

---

## 🎨 Visueel Design

### Modal Varianten

#### 1. Bottom Sheet (Default - Mobile & Desktop)
```tsx
<AppModal size="sm" variant="bottom-sheet">
  {/* Verschijnt onderaan scherm */}
  {/* Slide-up animatie */}
  {/* Drag handle zichtbaar */}
</AppModal>
```

**Gebruik voor:**
- Login
- Korte formulieren
- Confirmaties
- Kleine content modals

#### 2. Fullscreen (Grote modals op mobile)
```tsx
<AppModal size="lg">
  {/* Automatisch fullscreen op mobile */}
  {/* Slide-in animatie van rechts */}
</AppModal>
```

**Gebruik voor:**
- Formulieren met veel velden
- Data tabellen
- Complexe editors

#### 3. Centered (Expliciet geforceerd)
```tsx
<AppModal variant="default" size="md">
  {/* Gecentreerd op scherm */}
  {/* Alleen gebruiken als bottom-sheet niet passend is */}
</AppModal>
```

**Gebruik zelden - alleen voor speciale gevallen**

### Modal Sizes

| Size | Max Width | Gebruik                    |
|------|-----------|----------------------------|
| xs   | 320px     | Alerts, korte bevestigingen|
| sm   | 384px     | Login, kleine formulieren  |
| md   | 448px     | Standaard formulieren      |
| lg   | 672px     | Grote formulieren, tabellen|

### Design Tokens

```css
/* Overlay */
--modal-overlay: rgba(0, 0, 0, 0.8);
--modal-overlay-blur: 8px;

/* Z-index */
--z-modal-overlay: 1000;
--z-modal-content: 1001;

/* Animatie */
--modal-animation-enter: 250ms ease-out;
--modal-animation-exit: 200ms ease-in;

/* Spacing */
--modal-padding: 1.5rem;
--modal-gap: 1rem;
```

---

## 🔘 Button Systeem

### VERPLICHT: Drie Button Varianten

#### 1. Primary (Bevestigingsactie)
```tsx
<Button variant="default" type="submit">
  Opslaan
</Button>
```

**Gebruik voor:**
- Inloggen
- Opslaan
- Bevestigen
- Toevoegen
- Versturen

**Styling:** Paars background, witte tekst

#### 2. Secondary (Annuleren/Alternatief)
```tsx
<Button variant="secondary" type="button" onClick={onCancel}>
  Annuleren
</Button>
```

**Gebruik voor:**
- Annuleren
- Sluiten
- Terug
- Later
- Overslaan

**Styling:** Lichte achtergrond, donkere tekst

#### 3. Destructive (Verwijderen/Gevaar)
```tsx
<Button variant="destructive" type="button" onClick={onDelete}>
  Verwijderen
</Button>
```

**Gebruik voor:**
- Verwijderen
- Account sluiten
- Permanent wissen
- Irreversibele acties

**Styling:** Rode accent, wit op hover

### Button Layout

**Mobile & Desktop:**
```tsx
<div className="flex flex-col-reverse gap-3 mt-6">
  <Button variant="secondary">Annuleren</Button>
  <Button variant="default">Bevestigen</Button>
</div>
```

**Volgorde (bottom-to-top):**
1. Primary (bovenaan)
2. Secondary (daaronder)
3. Destructive (onderaan als aanwezig)

**❌ VERBODEN:**
- Meer dan 3 buttons in modal footer
- Custom button styling zonder variant prop
- Horizontale button layout op mobile

---

## ♿ Toegankelijkheid

### VERPLICHT: Accessibility Features

#### 1. Keyboard Navigation
```tsx
<AppModal
  onOpenChange={handleClose}
  // Escape key sluit modal
  // Tab navigeert door focusable elements
>
```

**Vereisten:**
- ✅ Escape key sluit modal (tenzij `persistent={true}`)
- ✅ Focus trap binnen modal
- ✅ Focus terug naar trigger na sluiten
- ✅ Tab-volgorde logisch (top-to-bottom)

#### 2. Screen Reader Support
```tsx
<AppModal
  title="Inloggen"                    // wordt aria-labelledby
  subtitle="Vul je gegevens in"       // wordt aria-describedby
  aria-labelledby="custom-title-id"   // optioneel custom
  aria-describedby="custom-desc-id"   // optioneel custom
>
```

#### 3. Focus Management
```tsx
// Automatisch geregeld door AppModal
// - Focus op eerste focusable element bij open
// - Focus trap actief
// - Focus terug naar trigger bij close
```

#### 4. Motion Preferences
```css
@media (prefers-reduced-motion: reduce) {
  .app-modal,
  .app-modal-overlay,
  .app-modal-bottom-sheet {
    animation: none !important;
    transition: none !important;
  }
}
```

### WCAG 2.1 Checklist

- ✅ **1.4.3 Contrast:** Alle tekst heeft minimaal 4.5:1 contrast ratio
- ✅ **2.1.1 Keyboard:** Alle functionaliteit beschikbaar via toetsenbord
- ✅ **2.1.2 No Keyboard Trap:** Focus kan modal verlaten (Escape)
- ✅ **2.4.3 Focus Order:** Logische tab-volgorde
- ✅ **2.4.7 Focus Visible:** Focus indicator zichtbaar
- ✅ **3.2.1 On Focus:** Geen automatische context changes
- ✅ **4.1.2 Name, Role, Value:** Correct gebruik van ARIA

---

## 🔒 Interactie Regels

### Modal Openen

```tsx
// 1. Via context hook
const { openLoginModal } = useModal();

// 2. Trigger in component
<Button onClick={openLoginModal}>
  Inloggen
</Button>

// 3. GEEN directe navigatie
// ❌ DOE DIT NIET
<Link to="/login">Inloggen</Link>
// ❌ DOE DIT NIET
navigate('/login');
```

### Modal Sluiten

**Vier manieren om te sluiten:**
1. ✅ Escape key
2. ✅ Close button (X)
3. ✅ Overlay click
4. ✅ Programmatisch via `onOpenChange(false)`

**Persistent modal (geen sluiten via Escape/Overlay):**
```tsx
<AppModal persistent={true}>
  {/* Alleen sluitbaar via expliciete actie */}
</AppModal>
```

### Body Scroll Lock

```tsx
// Automatisch geregeld door AppModal
// - Body scroll geblokkeerd als modal open is
// - Restored bij modal close
// - Werkt correct met multiple modals
```

**Implementatie (automatisch):**
```tsx
React.useEffect(() => {
  if (open) {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }
}, [open]);
```

---

## 📱 Mobile-First Gedrag

### Principe

**"De app gedraagt zich ALTIJD als een mobiele app, ook op desktop."**

Dit betekent:
- ✅ Bottom sheet op alle devices (tenzij expliciet anders)
- ✅ Max-width altijd ingesteld (geen full-width desktop modals)
- ✅ Touch-friendly button sizes (min-height: 48px)
- ✅ Safe area insets gerespecteerd (iOS notch/home indicator)

### Desktop Specificaties

```tsx
// Desktop toont GEEN grote centered dialogs
// Desktop toont WEL compact bottom-sheet

// Voorbeeld: Login modal
// Mobile: Bottom sheet 90vw
// Desktop: Bottom sheet 384px (max-width: sm)

<AppModal size="sm">
  {/* 
    Mobile: 90vw breed, onderaan scherm
    Desktop: 384px breed, onderaan scherm (maar gecentreerd horizontaal)
  */}
</AppModal>
```

### Safe Area Support

```css
/* Automatisch toegepast in bottom-sheet en fullscreen */
.app-modal-bottom-sheet {
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.app-modal-fullscreen {
  padding-top: env(safe-area-inset-top, 0);
  padding-bottom: env(safe-area-inset-bottom, 0);
}
```

---

## 🛠️ Implementatie Guide

### Stap 1: Voeg Modal State Toe aan Context

```tsx
// src/context/ModalContext.tsx

interface ModalContextType {
  // ... bestaande state
  
  // Nieuwe modal
  isMyModalOpen: boolean;
  openMyModal: () => void;
  closeMyModal: () => void;
}

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isMyModalOpen, setIsMyModalOpen] = useState(false);

  const openMyModal = useCallback(() => {
    setIsMyModalOpen(true);
  }, []);

  const closeMyModal = useCallback(() => {
    setIsMyModalOpen(false);
  }, []);

  return (
    <ModalContext.Provider value={{
      // ... bestaande values
      isMyModalOpen,
      openMyModal,
      closeMyModal,
    }}>
      {children}
    </ModalContext.Provider>
  );
};
```

### Stap 2: Maak Modal Content Component

```tsx
// src/components/modals/MyModalContent.tsx

import { Button } from "@/components/ui/button";

interface MyModalContentProps {
  onSuccess: () => void;
}

export const MyModalContent: React.FC<MyModalContentProps> = ({ onSuccess }) => {
  const handleSubmit = async () => {
    // ... logic
    onSuccess();
  };

  return (
    <div className="space-y-4">
      {/* Modal inhoud */}
      
      <div className="flex flex-col-reverse gap-3 mt-6">
        <Button variant="secondary" onClick={onCancel}>
          Annuleren
        </Button>
        <Button variant="default" onClick={handleSubmit}>
          Bevestigen
        </Button>
      </div>
    </div>
  );
};
```

### Stap 3: Registreer Modal in Layout

```tsx
// src/components/Layout.tsx

import { useModal } from "@/context/ModalContext";
import { MyModalContent } from "@/components/modals/MyModalContent";

const Layout = () => {
  const { isMyModalOpen, closeMyModal } = useModal();

  const handleSuccess = () => {
    closeMyModal();
    // ... andere success logic
  };

  return (
    <>
      {/* ... bestaande layout */}
      
      <AppModal
        open={isMyModalOpen}
        onOpenChange={closeMyModal}
        title="Mijn Modal Titel"
        subtitle="Optionele beschrijving"
        size="sm"
        showCloseButton={true}
      >
        <MyModalContent onSuccess={handleSuccess} />
      </AppModal>
    </>
  );
};
```

### Stap 4: Trigger Modal vanuit Component

```tsx
// Ergens in je app

import { useModal } from "@/context/ModalContext";

const MyComponent = () => {
  const { openMyModal } = useModal();

  return (
    <Button onClick={openMyModal}>
      Open Modal
    </Button>
  );
};
```

---

## ❌ Veelgemaakte Fouten

### 1. Modal in Page Component Renderen

```tsx
// ❌ FOUT
const MyPage = () => (
  <div>
    <AppModal open={true}>
      <ModalContent />
    </AppModal>
  </div>
);

// ✅ CORRECT
// Modal staat in Layout.tsx
// Page triggert alleen via context:
const MyPage = () => {
  const { openMyModal } = useModal();
  return <Button onClick={openMyModal}>Open</Button>;
};
```

### 2. Custom Button Styling

```tsx
// ❌ FOUT
<button className="my-custom-button">
  Opslaan
</button>

// ✅ CORRECT
<Button variant="default">
  Opslaan
</Button>
```

### 3. Desktop-Only Centered Modal

```tsx
// ❌ FOUT - Desktop krijgt andere UX dan mobile
<AppModal variant="default" size="lg">

// ✅ CORRECT - Consistent gedrag
<AppModal size="sm">  {/* auto bottom-sheet */}
```

### 4. Lokale Modal State

```tsx
// ❌ FOUT
const [isOpen, setIsOpen] = useState(false);

// ✅ CORRECT
const { isModalOpen, openModal, closeModal } = useModal();
```

### 5. Meer dan 3 Buttons

```tsx
// ❌ FOUT
<div>
  <Button>Actie 1</Button>
  <Button>Actie 2</Button>
  <Button>Actie 3</Button>
  <Button>Actie 4</Button>
</div>

// ✅ CORRECT
// Max 3 buttons, of splits in meerdere modals
<div className="flex flex-col-reverse gap-3">
  <Button variant="secondary">Annuleren</Button>
  <Button variant="default">Bevestigen</Button>
</div>
```

### 6. Navigatie naar Modal

```tsx
// ❌ FOUT
navigate('/login');
<Link to="/login">Inloggen</Link>

// ✅ CORRECT
openLoginModal();
<Button onClick={openLoginModal}>Inloggen</Button>
```

---

## 🧪 Testing Checklist

Voordat je een modal implementatie afrondt:

### Visueel
- [ ] Modal verschijnt als overlay boven alle content
- [ ] Achtergrond is donker/geblurd
- [ ] Bottom-sheet verschijnt onderaan
- [ ] Drag handle zichtbaar (bottom-sheet)
- [ ] Buttons hebben correcte varianten
- [ ] Buttons zijn full-width op mobile

### Functionaliteit
- [ ] Escape key sluit modal
- [ ] Overlay click sluit modal
- [ ] Close button (X) werkt
- [ ] Body scroll is geblokkeerd
- [ ] Modal body zelf is scrollbaar
- [ ] Focus gaat naar eerste element
- [ ] Focus terug naar trigger na sluiten

### Responsiveness
- [ ] Mobile: Bottom sheet correct
- [ ] Desktop: Ook bottom sheet (of fullscreen voor lg)
- [ ] Safe area insets gerespecteerd (iOS)
- [ ] Max-width correct toegepast
- [ ] Buttons stapelen op mobile

### Accessibility
- [ ] Tab navigatie werkt
- [ ] Screen reader kondigt titel aan
- [ ] Focus trap werkt
- [ ] Contrast ratio voldoende
- [ ] Reduced motion gerespecteerd

### Performance
- [ ] Animaties zijn smooth (<200ms)
- [ ] Geen layout shift bij openen
- [ ] Scroll positie bewaard
- [ ] Geen memory leaks

---

## 📋 Code Review Checklist

Gebruik deze checklist bij het reviewen van modal implementaties:

```markdown
## Modal Implementation Review

- [ ] Modal state in ModalContext
- [ ] Modal rendering in Layout.tsx
- [ ] Trigger via context hook
- [ ] AppModal gebruikt (niet custom wrapper)
- [ ] Correct size prop (xs/sm/md/lg)
- [ ] Title en subtitle aanwezig
- [ ] Buttons gebruiken Button component
- [ ] Max 3 buttons in footer
- [ ] Button varianten correct (default/secondary/destructive)
- [ ] Buttons in flex-col-reverse gap-3
- [ ] Full-width buttons (.w-full)
- [ ] onSuccess callback aanwezig
- [ ] closeModal wordt aangeroepen na success
- [ ] Geen lokale useState voor modal open/close
- [ ] Geen navigatie naar modal
- [ ] Accessibility props aanwezig
- [ ] Loading states geïmplementeerd
- [ ] Error handling aanwezig
```

---

## 📚 Referenties

### Componenten
- **AppModal:** `src/components/ui/app-modal.tsx`
- **Button:** `src/components/ui/button.tsx`
- **ModalContext:** `src/context/ModalContext.tsx`
- **Layout:** `src/components/Layout.tsx`

### Styling
- **Modal CSS:** `src/styles/components/modal.css`
- **Design Tokens:** `src/index.css`

### Documentatie
- **Design Tokens:** `DESIGN_TOKENS.md`
- **Routing:** [ROUTING.md](./ROUTING.md)

### Externe Resources
- [Radix UI Dialog](https://www.radix-ui.com/docs/primitives/components/dialog)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [iOS Human Interface Guidelines - Modality](https://developer.apple.com/design/human-interface-guidelines/modality)

---

## 🔄 Changelog

### v1.0 - December 2023
- ✅ Initial modal system guidelines
- ✅ ModalContext implementation
- ✅ AppModal mobile-first enforcement
- ✅ Body scroll lock
- ✅ LoginModal als referentie implementatie
- ✅ Comprehensive accessibility support

---

## 📞 Support

Bij vragen over modal implementatie:
1. Lees eerst deze guide volledig
2. Check LoginModal als referentie implementatie
3. Review bestaande modal code in Layout.tsx
4. Test je implementatie met de checklist

**Belangrijkste Regel:** Consistency above all. Alle modals moeten EXACT hetzelfde gedrag hebben.

---

**✅ Deze guidelines zijn verplicht voor ALLE modals in de app.**



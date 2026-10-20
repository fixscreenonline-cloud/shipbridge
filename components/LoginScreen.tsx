import { LoginForm } from "./LoginForm";
import { LoginHero } from "./LoginHero";

/** Full-page sign-in: hero on the left, form card on the right (stacked on phones). */
export function LoginScreen(props: { next: string; endpoint: string; title: string; subtitle: string; footnote: React.ReactNode }) {
  return (
    <section className="relative -mb-20 min-h-[calc(100dvh-60px)] overflow-hidden bg-ink text-white">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.07)_1px,transparent_0)] [background-size:22px_22px]"
      />
      <div aria-hidden className="absolute -right-32 -top-32 size-[28rem] rounded-full bg-hivis/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_420px] lg:gap-16 lg:py-16">
        <div className="order-2 lg:order-1">
          <LoginHero />
        </div>
        <div className="order-1 mx-auto w-full max-w-md lg:order-2">
          <LoginForm next={props.next} endpoint={props.endpoint} title={props.title} subtitle={props.subtitle} />
          <p className="mt-4 text-center text-xs text-white/60">{props.footnote}</p>
        </div>
      </div>
    </section>
  );
}

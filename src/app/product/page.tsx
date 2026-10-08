import type { Metadata } from "next";
import Link from "next/link";
import { ProductStage } from "./preview";
import styles from "./product.module.css";

export const metadata: Metadata = {
  title: "WatAgent — Make room for your day",
  description: "Your calendars, campus life, and an AI planning assistant. Bring your week together with WatAgent.",
};

export default function ProductPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#main">Skip to content</a>
      <header className={styles.nav}>
        <Link className={styles.brand} href="/product" aria-label="WatAgent home">WatAgent</Link>
        <nav aria-label="Main navigation"><a href="#features">Why WatAgent</a><a href="#preview">Take a look</a><Link className={styles.navCta} href="/">Open app <span aria-hidden="true">↗</span></Link></nav>
      </header>
      <main id="main">
        <section className={styles.hero}>
          <div className={styles.eyebrow}><span /> A LITTLE STRUCTURE. A LOT MORE POSSIBILITY.</div>
          <h1>Your days,<br /><em>thoughtfully</em> planned.</h1>
          <p>Bring your calendars together. Talk through your plans.<br className={styles.desktopBreak} /> Find a little more space for what matters.</p>
          <div className={styles.actions}><Link className={styles.primary} href="/">Start your day with WatAgent <span aria-hidden="true">↗</span></Link><a className={styles.secondary} href="#preview">Explore the calendar <span aria-hidden="true">↓</span></a></div>
          <div className={styles.heroNote}>YOUR WEEK, WITH A LITTLE BREATHING ROOM.</div>
        </section>
        <section id="preview" className={styles.previewSection} aria-label="Interactive product preview">
          <div className={styles.previewCaption}><span>YOUR CALENDAR, WITH AN ASSISTANT</span><span>↓ Explore WatAgent</span></div>
          <ProductStage />

        </section>
        <section id="features" className={styles.features}>
          <div className={styles.sectionIntro}><span className={styles.label}>LESS JUGGLING, MORE LIVING</span><h2>A calendar that sees<br />the <em>whole picture.</em></h2><p>Classes, deadlines, coffee with a friend.<br />It all belongs in the same conversation.</p></div>
          <div className={styles.featureGrid}>
            <article><span className={styles.featureNumber}>01 / BRING IT TOGETHER</span><div className={styles.miniCalendars}><span>Personal</span><span>Google Calendar</span><span>Classes</span><b>↘ &nbsp; ↓ &nbsp; ↙</b><strong>Your week, together</strong></div><h3>Many calendars. One day.</h3><p>Connect Google Calendar, import calendars, and organize your sources in a visual calendar map.</p></article>
            <article><span className={styles.featureNumber}>02 / THINK OUT LOUD</span><div className={styles.miniChat}><span>Help me plan around my classes.</span><strong>✳ &nbsp; Start with a conversation.</strong><i>Context from your calendars. Space for your plans.</i></div><h3>A planning partner, on hand.</h3><p>Talk to an AI assistant with calendar context. Turn a busy week into a plan you can work with.</p></article>
            <article><span className={styles.featureNumber}>03 / STAY IN THE LOOP</span><div className={styles.miniEvent}><span>ON CAMPUS</span><strong>Something worth<br />making time for.</strong><div>Talks &nbsp; · &nbsp; Workshops &nbsp; · &nbsp; Events</div></div><h3>Campus is part of your world.</h3><p>Explore Waterloo campus events and manage your subscriptions alongside the rest of your schedule.</p></article>
          </div>
        </section>
        <section className={styles.faq} aria-labelledby="faq-title"><h2 id="faq-title">A few things to know.</h2><div><details><summary>Can I bring my existing calendars?<span>+</span></summary><p>WatAgent supports Google Calendar connections and calendar imports. Open the app to connect and organize your calendar sources.</p></details><details><summary>What does the AI assistant do?<span>+</span></summary><p>The assistant helps you work through plans using calendar context. You can attach calendars to a conversation and ask about your schedule.</p></details><details><summary>Is WatAgent just for campus events?<span>+</span></summary><p>No. You can manage personal calendars, events, and tasks. Waterloo campus events are another way to bring your week together.</p></details></div></section>
        <section className={styles.closing}><span className={styles.label}>MAKE A LITTLE SPACE</span><h2>Your next week<br />could feel <em>different.</em></h2><Link className={styles.primary} href="/">Open WatAgent <span aria-hidden="true">↗</span></Link></section>
      </main>
      <footer className={styles.footer}><Link className={styles.brand} href="/product">WatAgent</Link><span>A little clarity for your everyday.</span><Link href="/privacy">Privacy</Link></footer>
    </div>
  );
}

import "./home.css";

export const mountHome = () => {
  document.title = "王国前线";
  document.body.innerHTML = `
    <main class="home">
      <header class="home__masthead"><span>王国前线</span><small>选择你的战场</small></header>
      <section class="home__hero"><p>一边守住堡垒，一边经营领地。</p><h1>你将如何统治这片土地？</h1></section>
      <section class="game-picker">
        <a class="game-card game-card--tower" href="?mode=tower">
          <span>即时塔防</span><h2>堡垒前线</h2><p>调度驻军、释放战术技能，在不断升级的战场上争夺堡垒。</p><b>进入塔防</b>
        </a>
        <a class="game-card game-card--manor" href="?mode=manor">
          <span>领地经营</span><h2>领主的土地</h2><p>规划村庄、安排村民、渡过寒冬，并在劫掠到来前组织民兵。</p><b>进入领地</b>
        </a>
      </section>
    </main>`;
};

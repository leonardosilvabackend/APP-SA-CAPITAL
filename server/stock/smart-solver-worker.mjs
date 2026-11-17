import { parentPort } from "node:worker_threads";
import loadHighs from "highs";

const highs = await loadHighs();
const clean = value => Math.abs(value) < 1e-9 ? 0 : value;
let deadline=Infinity;
const cutoff=new Error('SEARCH_DEADLINE');
const publish=counts=>parentPort.postMessage({progress:true,winners:[{group:0,counts}]});

function lp(group, objective, constraints = [], distance = false) {
  const terms = coefficients => coefficients.map((value,index) => `${clean(value)} x${index}`).join(" + ");
  const rows = [
    `credit_min: ${terms(group.map(item=>item.credit))} >= __MIN__`,
    `credit_max: ${terms(group.map(item=>item.credit))} <= __MAX__`,
    ...constraints,
  ];
  if (distance) rows.push(`distance_high: ${terms(group.map(item=>item.credit))} - distance <= __TARGET__`, `distance_low: ${terms(group.map(item=>-item.credit))} - distance <= -__TARGET__`);
  return `Minimize\n objective: ${distance ? "distance" : terms(objective)}\nSubject To\n ${rows.join("\n ")}\nBounds\n ${group.map((item,index)=>`0 <= x${index} <= ${item.count}`).join("\n ")}\n${distance ? "0 <= distance\n" : ""}Generals\n ${group.map((_,index)=>`x${index}`).join(" ")}\nEnd`;
}

function solve(group, bounds, objective, constraints = [], distance = false) {
  if (Date.now()>=deadline) throw cutoff;
  const model = lp(group,objective,constraints,distance).replaceAll("__MIN__",String(bounds.minimum)).replaceAll("__MAX__",String(bounds.maximum)).replaceAll("__TARGET__",String(bounds.target));
  const result = highs.solve(model,{output_flag:false,presolve:"on",mip_rel_gap:0,time_limit:Math.max(0.001,(deadline-Date.now())/1000)});
  const values=group.map((_,index)=>result.Columns?.[`x${index}`]?.Primal);
  if (values.every(value=>Number.isFinite(value)&&Math.abs(value-Math.round(value))<1e-6)) publish(values.map(Math.round));
  if (result.Status !== 'Optimal' && result.Status !== 'Infeasible') throw cutoff;
  if (result.Status !== "Optimal") return null;
  return { counts:group.map((_,index)=>Math.max(0,Math.round(result.Columns[`x${index}`]?.Primal ?? 0))),objective:result.ObjectiveValue };
}
const sum = (group,counts,field) => group.reduce((total,item,index)=>total+item[field]*counts[index],0);
const row = (name,group,coefficients,operator,value) => `${name}: ${coefficients.map((coefficient,index)=>`${clean(coefficient)} x${index}`).join(" + ")} ${operator} ${clean(value)}`;

function optimize(group,bounds,priority,fallback) {
  const restrictions = [];
  if (!fallback && bounds.budget !== null) restrictions.push(row("budget",group,group.map(item=>item.installment),"<=",bounds.budget));
  let answer;
  if (fallback) {
    answer=solve(group,bounds,group.map(item=>item.installment),restrictions); if(!answer)return null;
    const installment=sum(group,answer.counts,"installment"); restrictions.push(row("best_installment",group,group.map(item=>item.installment),"<=",installment));
    priority="entry";
  }
  if(priority === "entry" || priority === "installment") {
    let ratio=0,converged=false;
    for(let iteration=0;iteration<30;iteration++) {
      answer=solve(group,bounds,group.map(item=>item[priority]-ratio*item.credit),restrictions); if(!answer)return null;
      const numerator=sum(group,answer.counts,priority), denominator=sum(group,answer.counts,"credit"), next=numerator/denominator;
      if(Math.abs(next-ratio)<1e-12){ratio=next;converged=true;break;} ratio=next;
    }
    if(!converged)throw cutoff;
    const numerator=sum(group,answer.counts,priority),denominator=sum(group,answer.counts,"credit");
    restrictions.push(row("best_ratio",group,group.map(item=>item[priority]*denominator-numerator*item.credit),"<=",0));
  } else {
    answer=solve(group,bounds,group.map(item=>item.balance-item.credit),restrictions); if(!answer)return null;
    const best=sum(group,answer.counts,"balance")-sum(group,answer.counts,"credit");
    restrictions.push(row("best_balance",group,group.map(item=>item.balance-item.credit),"<=",best));
  }
  answer=solve(group,bounds,[],restrictions,true); if(!answer)return null;
  const credit=sum(group,answer.counts,"credit"),distance=Math.abs(credit-bounds.target);
  restrictions.push(row("distance_high_tie",group,group.map(item=>item.credit),"<=",bounds.target+distance));
  restrictions.push(row("distance_low_tie",group,group.map(item=>item.credit),">=",bounds.target-distance));
  const finalField=priority === "balance" ? "balance" : priority;
  return solve(group,bounds,group.map(item=>item[finalField]),restrictions)?.counts ?? answer.counts;
}

parentPort.on("message",payload=>{
  try {
    deadline=Math.min(payload.deadline ?? Infinity,Date.now()+(payload.groupBudgetMs ?? 15_000));
    const convert=value=>Number(value)/100;
    const groups=payload.groups.map(group=>group.map(item=>({count:item.count,credit:convert(item.credit),entry:convert(item.entry),installment:convert(item.installment),balance:convert(item.balance)})));
    const bounds={target:convert(payload.target),minimum:convert(payload.minimum),maximum:convert(payload.maximum),budget:payload.budget===null?null:convert(payload.budget)};
    const fallback=Boolean(payload.forceFallback);
    // Feasible seeds survive interruption; the parent verifies integer cents.
    for(const group of groups) {
      for(let i=0;i<group.length;i++) if(group[i].credit>=bounds.minimum && group[i].credit<=bounds.maximum) {const counts=group.map(()=>0);counts[i]=1;publish(counts);}
      for(const order of [group.map((_,i)=>i),group.map((_,i)=>i).sort((a,b)=>group[b].credit-group[a].credit),group.map((_,i)=>i).sort((a,b)=>group[a][payload.priority]/group[a].credit-group[b][payload.priority]/group[b].credit)]) {
        let credit=0,installment=0;const counts=group.map(()=>0);
        for(const i of order) {
          if(Date.now()>=deadline)throw cutoff;
          let n=Math.min(group[i].count,Math.floor((bounds.maximum-credit)/group[i].credit));
          if(!fallback && bounds.budget!==null && group[i].installment>0)n=Math.min(n,Math.max(0,Math.floor((bounds.budget-installment)/group[i].installment)));
          counts[i]=n;credit+=n*group[i].credit;installment+=n*group[i].installment;
          if(n>0 && credit>=bounds.minimum)publish([...counts]);
        }
      }
    }
    const winners=groups.map((group,index)=>({group:index,counts:optimize(group,bounds,payload.priority,fallback)})).filter(value=>value.counts);
    parentPort.postMessage({fallback,winners,complete:true});
  } catch(error) { if(error===cutoff)parentPort.postMessage({winners:[],complete:false});else parentPort.postMessage({error:error instanceof Error?error.message:"Falha na otimização"}); }
});

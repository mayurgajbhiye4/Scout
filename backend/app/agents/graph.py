"""
LangGraph research orchestration graph definition.
"""

from langgraph.graph import END, StateGraph

from app.agents.nodes.contradiction import contradiction_node
from app.agents.nodes.critic import critic_node, should_revise
from app.agents.nodes.evidence import evidence_node
from app.agents.nodes.planner import planner_node
from app.agents.nodes.researcher import researcher_node
from app.agents.nodes.retriever import retriever_node
from app.agents.nodes.router import route_research, router_node
from app.agents.nodes.synthesizer import synthesizer_node
from app.agents.state import AgentState


def build_research_graph() -> StateGraph:
    """Assemble the 7-stage LangGraph research workflow."""
    
    workflow = StateGraph(AgentState)
    
    # 1. Add all nodes
    workflow.add_node("planner", planner_node)
    workflow.add_node("router", router_node)
    
    # Worker wrappers that advance current_task_idx
    async def researcher_wrapper(state: AgentState):
        res = await researcher_node(state)
        res["current_task_idx"] = state.get("current_task_idx", 0) + 1
        return res

    async def retriever_wrapper(state: AgentState):
        res = await retriever_node(state)
        res["current_task_idx"] = state.get("current_task_idx", 0) + 1
        return res
        
    workflow.add_node("researcher", researcher_wrapper)
    workflow.add_node("retriever", retriever_wrapper)
    workflow.add_node("evidence", evidence_node)
    workflow.add_node("contradiction", contradiction_node)
    workflow.add_node("synthesizer", synthesizer_node)
    workflow.add_node("critic", critic_node)
    
    # 2. Define transitions and edges
    workflow.set_entry_point("planner")
    workflow.add_edge("planner", "router")
    
    # After router, choose worker or proceed to evidence
    workflow.add_conditional_edges(
        "router",
        route_research,
        {
            "researcher": "researcher",
            "retriever": "retriever",
            "evidence": "evidence"
        }
    )
    
    # After each worker executes, route back to router to pick next task
    workflow.add_edge("researcher", "router")
    workflow.add_edge("retriever", "router")
    
    # Once all tasks finish, evidence -> contradiction -> synthesizer -> critic
    workflow.add_edge("evidence", "contradiction")
    workflow.add_edge("contradiction", "synthesizer")
    workflow.add_edge("synthesizer", "critic")
    
    # Critic reflection loop
    workflow.add_conditional_edges(
        "critic",
        should_revise,
        {
            "revise": "synthesizer",
            "end": END
        }
    )
    
    return workflow.compile()


# Export compiled graph
research_graph = build_research_graph()

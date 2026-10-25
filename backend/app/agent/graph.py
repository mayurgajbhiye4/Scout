"""LangGraph execution graph.

retrieve -> (web_search) -> evaluate -> generate
                               |
                               +-> retrieve | web_search with a rewritten query, while the evidence is
                                   insufficient and retries remain
"""
from langgraph.graph import StateGraph, END
from app.agent.state import ResearchChatState
from app.agent.nodes import (
    retrieve_node,
    web_search_node,
    evaluate_evidence_node,
    generate_node,
    should_search_web,
    route_after_evaluation,
)

def build_graph():
    workflow = StateGraph(ResearchChatState)

    workflow.add_node("retrieve", retrieve_node)
    workflow.add_node("web_search", web_search_node)
    workflow.add_node("evaluate", evaluate_evidence_node)
    workflow.add_node("generate", generate_node)

    workflow.set_entry_point("retrieve")
    workflow.add_conditional_edges("retrieve", should_search_web, {
        "web_search": "web_search",
        "generate": "evaluate"
    })
    workflow.add_edge("web_search", "evaluate")
    workflow.add_conditional_edges("evaluate", route_after_evaluation, {
        "retrieve": "retrieve",
        "web_search": "web_search",
        "generate": "generate"
    })
    workflow.add_edge("generate", END)

    return workflow.compile()

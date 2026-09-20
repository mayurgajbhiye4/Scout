"""LangGraph execution graph."""
from langgraph.graph import StateGraph, END
from app.agent.state import ResearchChatState
from app.agent.nodes import retrieve_node, web_search_node, generate_node, should_search_web

def build_graph():
    workflow = StateGraph(ResearchChatState)
    
    workflow.add_node("retrieve", retrieve_node)
    workflow.add_node("web_search", web_search_node)
    workflow.add_node("generate", generate_node)
    
    workflow.set_entry_point("retrieve")
    workflow.add_conditional_edges("retrieve", should_search_web, {
        "web_search": "web_search",
        "generate": "generate"
    })
    workflow.add_edge("web_search", "generate")
    workflow.add_edge("generate", END)
    
    return workflow.compile()
